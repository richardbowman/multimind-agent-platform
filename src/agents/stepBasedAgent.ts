import { Agent } from './agents';
import { getExecutorMetadata } from './decorators/executorDecorator';
import 'reflect-metadata';
import { ChatClient, ChatPost } from '../chat/chatClient';
import { HandleActivity, HandlerParams, ResponseType } from './agents';
import LMStudioService, { StructuredOutputPrompt } from '../llm/lmstudioService';
import { Project, Task, TaskManager } from '../tools/taskManager';
import { Planner } from './planners/Planner';
import { DefaultPlanner } from './planners/DefaultPlanner';
import crypto from 'crypto';
import Logger from '../helpers/logger';
import { CreateArtifact, ModelResponse } from './schemas/ModelResponse';
import ChromaDBService from 'src/llm/chromaService';
import { PlanStepsResponse } from './schemas/PlanStepsResponse';

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
    protected planner: Planner;

    constructor(
        chatClient: ChatClient,
        lmStudioService: LMStudioService,
        userId: string,
        projects: TaskManager,
        chromaDBService: ChromaDBService,
        planner?: Planner
    ) {
        super(chatClient, lmStudioService, userId, projects, chromaDBService);
        this.planner = planner || new DefaultPlanner(
            lmStudioService,
            projects,
            userId,
            this.modelHelpers,
            this.stepExecutors,
            this.finalInstructions
        );
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
        const steps = await this.planner.planSteps(handlerParams);
        return steps;
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

            Logger.info(`Executing step "${task.type}" for project "${projectId}"`);

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

                    await this.planSteps({
                        projects: [project], 
                        message: planningPrompt
                    });
                } else {
                    // If validation passed, mark validation step as complete
                    await this.projects.completeTask(task.id);
                    return;
                }
            } else if (stepResult.finished) {
                this.projects.completeTask(task.id);
                Logger.info(`Completed step "${task.type}" for project "${projectId}"`);

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
            } else {
                await this.reply(userPost, {
                    message: `Just finished ${task.type}, still working...`
                }, {
                    "project-id": stepResult.projectId||projectId
                });
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

        return await this.modelHelpers.generate({
            message: context,
            instructions
        });
    }


    protected async generateAndSendFinalResponse(projectId: string, userPost: ChatPost): Promise<void> {
        const project = this.projects.getProject(projectId);
        
        // Get all completed tasks' results
        const tasks = Object.values(project.tasks);
        const completedResults = tasks
            .filter(t => t.complete)
            .map(t => t.props?.result)
            .filter(r => r);

        // Execute final response executor
        const executor = this.stepExecutors.get('final_response');
        if (!executor) {
            throw new Error('Final response executor not found');
        }

        const finalResult = await executor.execute(project.name, 'final_response', projectId, completedResults);
        const finalResponse = finalResult.response;

        const artifactId = crypto.randomUUID();
        if (!finalResponse?.message) {
            throw new Error('Final response message is undefined');
        }

        const artifact = await this.artifactManager.saveArtifact({
            id: artifactId,
            type: 'summary',
            content: finalResponse.message,
            metadata: {
                title: `Summary: ${project.name}`,
                query: project.name,
                type: 'summary',
                steps: tasks.map(t => t.description)
            }
        });

        const response: CreateArtifact = {
            message: `${finalResponse.message}\n\n---\nYou can ask follow-up questions by replying with your question.`,
            artifactId: artifact.id,
            artifactTitle: artifact.metadata?.title
        };

        await this.reply(userPost, response);
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
