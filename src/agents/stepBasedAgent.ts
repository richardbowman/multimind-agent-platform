import { Agent } from './agents';
import { getExecutorMetadata, EXECUTOR_METADATA_KEY } from './decorators/executorDecorator';
import 'reflect-metadata';
import { ChatClient, ChatPost } from '../chat/chatClient';
import { HandleActivity, HandlerParams, ResponseType } from './agents';
import LMStudioService, { StructuredOutputPrompt } from '../llm/lmstudioService';
import { Project, Task, TaskManager } from '../tools/taskManager';
import Logger from '../helpers/logger';
import { CreateArtifact, ModelResponse } from './schemas/ModelResponse';
import crypto from 'crypto';
import { definitions as generatedSchemaDef } from "./schemas/schema.json";
import ChromaDBService from 'src/llm/chromaService';
import { Handler } from 'puppeteer';
import { PlanStepsResponse } from './schemas/PlanStepsResponse';
import * as schemaJson from "./schemas/schema.json";
import { SchemaInliner } from 'src/helpers/schemaInliner';

export interface StepResult {
    type?: string;
    projectId?: string;
    taskId?: string;
    finished?: boolean;
    [key: string]: any;
    needsUserInput?: boolean;
    response: ModelResponse;
}

export interface StepExecutor {
    execute(goal: string, step: string, projectId: string, previousResult?: any): Promise<StepResult>;
}

export abstract class StepBasedAgent<P, T> extends Agent<P, T> {
    protected stepExecutors: Map<string, StepExecutor> = new Map();

    constructor(
        chatClient: ChatClient,
        lmStudioService: LMStudioService,
        userId: string,
        projects: TaskManager,
        chromaDBService: ChromaDBService
    ) {
        super(chatClient, lmStudioService, userId, projects, chromaDBService);
    }

    protected registerStepExecutor(executor: StepExecutor): void {
        const metadata = getExecutorMetadata(executor.constructor);
        if (metadata) {
            // Use decorator metadata if available
            this.stepExecutors.set(metadata.key, executor);
        } else {
            Logger.warn(`No metadata or description found for executor ${executor.constructor.name}`);
        }
    }

    protected async planSteps(handlerParams: HandlerParams): Promise<PlanStepsResponse> {
        const executorMetadata = Array.from(this.stepExecutors.entries()).map(([key, executor]) => {
            const metadata = getExecutorMetadata(executor.constructor);
            return {
                key,
                description: metadata?.description || 'No description available'
            };
        });

        const schema = new SchemaInliner(schemaJson).inlineReferences(schemaJson.definitions).PlanStepsResponse;

        const project = handlerParams.projects[0];
        const tasks = this.projects.getAllTasks(project.id);

        const formatCompletedTasks = (tasks: Task[]) => {
            return tasks.map(t => {
                const type = t.type ? `**Type**: ${t.type}` : '';
                return `- ${t.description}\n  ${type}`;
            }).join('\n');
        };

        const formatCurrentTasks = (tasks: Task[]) => {
            return tasks.map(t => {
                const type = t.type ? `**Type**: ${t.type}` : '';
                return `- ${t.description}\n  ${type}\n  **ID**: ${t.id}`;
            }).join('\n');
        };

        const completedTasks = tasks.filter(t => t.complete);
        const currentTasks = tasks.filter(t => !t.complete);

        const completedSteps = completedTasks.length > 0 ? 
            `## Completed Tasks\n${formatCompletedTasks(completedTasks)}\n\n` : 
            `## Completed Tasks\n*No completed tasks yet*\n\n`;

        const currentSteps = currentTasks.length > 0 ? 
            `## Current Plan\n${formatCurrentTasks(currentTasks)}\n\n` : 
            `## Current Plan\n*No tasks in current plan*\n\n`;

        const stepDescriptions = executorMetadata
            .map(({ key, description }) => `${key}\n    Description: ${description}`)
            .join("\n\n");

        const systemPrompt =
            `${this.modelHelpers.getPurpose()}

PROJECT GOAL: ${project.name}

TASK GOAL: Your only job is to create new steps to achieve the goal if they are missing, and reorder steps if needed to change priority.
Return a steps list in the order you want the steps performed.

The allowable step types you can execute in the plan:
${stepDescriptions}

If you've completed any steps already they will be listed here:
${completedSteps}

This is your current active step list. If you remove an item from this list, we'll assume it isn't needed any longer. 
You can add new items by specifying a type and a description.
You must include current steps in your response using their provided ID.

${currentSteps}`;

        const response: PlanStepsResponse = await this.generate({
            ...handlerParams,
            instructions: new StructuredOutputPrompt(schema, systemPrompt)
        });

        Logger.info(`PlanStepsResponse: ${JSON.stringify(response, null, 2)}`);

        // Create a map of existing tasks by ID
        const existingTaskMap = new Map(
            tasks.map(task => [task.id, task])
        );

        // Track which tasks are mentioned in the response
        const mentionedTaskIds = new Set<string>();

        // Update task order and status based on response
        response.steps.forEach((step, index) => {
            if (step.existingId && existingTaskMap.has(step.existingId)) {
                // Update existing task
                const existingTask = existingTaskMap.get(step.existingId)!;
                existingTask.order = index;
                if (step.actionType) existingTask.type = step.actionType;
                if (step.parameters) existingTask.description = step.parameters;
                mentionedTaskIds.add(step.existingId);
            } else {
                // Create new task
                const newTask: Task = {
                    id: crypto.randomUUID(),
                    type: step.actionType,
                    description: step.parameters || step.actionType,
                    creator: this.userId,
                    complete: false,
                    order: index
                };
                this.projects.addTask(project, newTask);
            }
        });

        // Mark any tasks not mentioned in the response as completed
        for (const [taskId, task] of existingTaskMap) {
            if (!mentionedTaskIds.has(taskId)) {
                this.projects.completeTask(taskId);
            }
        }

        return response;
    }

    protected async executeNextStep(projectId: string, userPost: ChatPost): Promise<void> {
        const task = this.projects.getNextTask(projectId);
        if (!task) {
            Logger.warn('No tasks found to execute');
            return;
        }
        this.projects.markTaskInProgress(task);
        await this.executeStep(projectId, task, userPost);
    }

    protected async projectCompleted(project: Project): Promise<void> {
        const postId = project.metadata?.originalPostId;
        const userPost = await this.chatClient.getPost(postId);
        await this.generateAndSendFinalResponse(project.id, userPost);
        return;
    }

    protected async executeStep(projectId: string, task: Task, userPost: ChatPost): Promise<void> {
        try {
            const executor = this.stepExecutors.get(task.type);
            if (!executor) {
                throw new Error(`No executor found for step type: ${task.type}`);
            }

            const project = this.projects.getProject(projectId);
            if (!project) {
                throw new Error(`Project ${projectId} not found`);
            }

            // Get all prior completed tasks' results
            const tasks = this.projects.getAllTasks(projectId);
            const priorResults = tasks
                .filter(t => t.complete && t.order !== undefined && t.order < (task.order || Infinity))
                .sort((a, b) => (a.order || 0) - (b.order || 0))
                .map(t => t.props?.result)
                .filter(r => r); // Remove undefined/null results

            const stepResult = await executor.execute(
                `${userPost.message} [${project.name}]`,
                task.type,
                projectId,
                priorResults
            );

            // Store the result in task props
            if (!task.props) task.props = {};
            task.props.result = stepResult.response;

            // If this was a validation step, check if we need more work
            if (task.type === 'validation') {
                if (!stepResult.isComplete && stepResult.missingAspects?.length > 0) {
                    // Plan additional steps only if validation failed
                    const planningPrompt = `Original Goal: ${project.name}\n\n` +
                        `The solution is not yet complete. Please continue working on the goal.\n` +
                        `Missing aspects to address:\n` +
                        `${stepResult.missingAspects.map((aspect: string) => `- ${aspect}`).join('\n')}`;

                    await this.planSteps(projectId, planningPrompt);
                } else {
                    // If validation passed, mark validation step as complete
                    await this.projects.completeTask(task.id);
                    return;
                }
            } else if (stepResult.finished) {
                this.projects.completeTask(task.id);

                // If this was the last planned task, add a validation step
                const remainingTasks = this.projects.getAllTasks(projectId).filter(t => !t.complete);
                if (remainingTasks.length === 0) {
                    const validationTask: Task = {
                        id: crypto.randomUUID(),
                        type: 'validation',
                        description: 'Validate solution completeness',
                        creator: this.userId,
                        complete: false,
                        order: (task.order || 0) + 1
                    };
                    this.projects.addTask(project, validationTask);
                }
            }

            if (stepResult.projectId) {
                const newProject = this.projects.getProject(stepResult.projectId);
                newProject.metadata.parentTaskId = task.id;
                //TODO need a way to update project to disk
            }

            if (stepResult.needsUserInput && stepResult.response) {
                await this.reply(userPost, stepResult.response, {
                    "project-id": stepResult.projectId||projectId
                });
                return;
            }

            await this.executeNextStep(projectId, userPost);

        } catch (error) {
            Logger.error("Error in step execution:", error);
            await this.reply(userPost, { message: "Sorry, I encountered an error while processing your request." });
        }
    }

    private async determineNextAction(projectId: string, lastStepResult: StepResult): Promise<{
        needsUserInput: boolean;
        question?: string;
        isComplete: boolean;
        nextStep?: string;
    }> {
        const registeredSteps = Array.from(this.stepExecutors.keys());

        const schema = {
            type: "object",
            properties: {
                needsUserInput: {
                    type: "boolean",
                    description: "Whether we need to ask the user a question"
                },
                question: {
                    type: "string",
                    description: "Question to ask the user if needed"
                },
                isComplete: {
                    type: "boolean",
                    description: "Whether we have enough information to generate final response"
                },
                nextStep: {
                    type: "string",
                    enum: registeredSteps,
                    description: `Next step to execute. Must be one of: ${registeredSteps.join(', ')}`
                }
            },
            required: ["needsUserInput", "isComplete"]
        };

        const systemPrompt = `You are an AI assistant analyzing intermediate results.
Based on the current state and results, determine if we:
1. Need to ask the user a question
2. Have enough information to generate a final response
3. Should continue with another step

Consider the original goal and what we've learned so far.`;

        const instructions = new StructuredOutputPrompt(schema, systemPrompt);
        const project = this.projects.getProject(projectId);
        const context = JSON.stringify({
            originalGoal: project.name,
            currentStep: lastStepResult.type,
            results: lastStepResult
        }, null, 2);

        return await this.generate({
            message: context,
            instructions
        });
    }


    protected async generateAndSendFinalResponse(projectId: string, userPost: ChatPost): Promise<void> {
        const project = this.projects.getProject(projectId);
        const finalResponse = await this.generateFinalResponse(project);

        const artifactId = crypto.randomUUID();
        const artifact = await this.artifactManager.saveArtifact({
            id: artifactId,
            type: 'summary',
            content: finalResponse.message,
            metadata: {
                title: `Summary: ${project.name}`,
                query: project.name,
                type: 'summary',
                steps: Object.values(project.tasks).map(t => t.description)
            }
        });

        const response: CreateArtifact = {
            message: `${finalResponse.message}\n\n---\nYou can ask follow-up questions by replying with your question.`,
            artifactId: artifact.id,
            artifactTitle: artifact.metadata?.title
        };

        await this.reply(userPost, response);
    }

    private async generateFinalResponse(project: Project<Task>): Promise<ModelResponse> {
        const schema = {
            type: "object",
            properties: {
                message: {
                    type: "string",
                    description: "Final comprehensive response in Markdown format."
                }
            },
            required: ["message"]
        };

        const systemPrompt = `You are an AI assistant generating a final response.
Synthesize all the intermediate results into a clear, comprehensive answer that addresses the original goal.
Include relevant details from all steps while maintaining clarity and coherence.
You will respond inside of the message key in Markdown format.`;

        const instructions = new StructuredOutputPrompt(schema, systemPrompt);
        const context = JSON.stringify({
            originalGoal: project.name,
            tasks: Object.values(project.tasks),
            results: Object.values(project.tasks).map(t => t.description)
        }, null, 2);

        return await this.generate({
            message: context,
            instructions,
            maxTokens: 16384
        });
    }

    protected async handleUserInput(projectId: string, currentStep: string, userPost: ChatPost): Promise<void> {
        const project = this.projects.getProject(projectId);
        if (!project) {
            throw new Error(`Project ${projectId} not found`);
        }

        // Create a task for the user input with order=0 to make it first
        const task = {
            id: randomUUID(),
            description: `User response: ${userPost.message}`,
            creator: this.userId,
            projectId: projectId,
            type: 'user_input',
            complete: true,
            order: 0 // This ensures it appears first
        };

        // Update order of existing tasks to make room
        for (const existingTask of Object.values(project.tasks)) {
            if (existingTask.order === undefined) {
                existingTask.order = 1;
            } else {
                existingTask.order += 1;
            }
        }

        await this.projects.addTask(project, task);

        // Continue execution
        await this.executeStep(projectId, currentStep, userPost);
    }

    @HandleActivity("start-thread", "Start conversation with user", ResponseType.CHANNEL)
    protected async handleConversation(params: HandlerParams): Promise<void> {
        const { projectId } = await this.addNewProject({
            projectName: params.userPost.message,
            tasks: [{
                type: "reply",
                description: "Initial response to user query."
            }],
            metadata: {
                originalPostId: params.userPost.id
            }
        });

        const posts = [params.userPost];
        const plan = await this.planSteps(projectId, posts);
        await this.executeNextStep(projectId, params.userPost);
    }

    @HandleActivity("response", "Handle responses on the thread", ResponseType.RESPONSE)
    protected async handleThreadResponse(params: HandlerParams): Promise<void> {
        const project = params.projects?.[0];
        if (!project) {
            await this.reply(params.userPost, {
                message: "No active session found. Please start a new conversation."
            });
            return;
        }

        const currentTask = Object.values(project.tasks).find(t => t.inProgress);
        if (!currentTask) {
            await this.reply(params.userPost, {
                message: "I wasn't expecting a response right now. What would you like to discuss?"
            });
            return;
        }

        // Get conversation history for this thread
        const posts = await this.chatClient.getThreadPosts(params.userPost.getRootId() || params.userPost.id);
        const plan = await this.planSteps(project.id, posts);
        await this.executeNextStep(project.id, params.userPost);
    }
}
