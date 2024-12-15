import { Agent } from './agents';
import { getExecutorMetadata } from './decorators/executorDecorator';
import 'reflect-metadata';
import { ChatClient, ChatPost } from '../chat/chatClient';
import { HandleActivity, HandlerParams, ResponseType } from './agents';
import { StructuredOutputPrompt } from "src/llm/ILLMService";
import { AgentConstructorParams } from './interfaces/AgentConstructorParams';
import { Project, Task, TaskManager } from '../tools/taskManager';
import { Planner } from './planners/Planner';
import { MultiStepPlanner } from './planners/DefaultPlanner';
import crypto from 'crypto';
import Logger from '../helpers/logger';
import { CreateArtifact, ModelMessageResponse } from '../schemas/ModelResponse';
import ChromaDBService from 'src/llm/chromaService';
import { PlanStepsResponse } from '../schemas/PlanStepsResponse';
import { InMemoryPost } from 'src/chat/inMemoryChatClient';
import { SimpleNextActionPlanner } from './planners/SimpleNextActionPlanner';

export interface StepResult {
    type?: string;
    projectId?: string;
    taskId?: string;
    finished?: boolean;
    [key: string]: any;
    needsUserInput?: boolean;
    response: ModelMessageResponse;
}

export interface StepExecutor {
    execute(goal: string, step: string, projectId: string, previousResult?: any): Promise<StepResult>;
    onTaskNotification?(task: Task): Promise<void>;
    onProjectCompleted?(project: Project): Promise<void>;
}

export abstract class StepBasedAgent<P, T> extends Agent<P, T> {
    protected stepExecutors: Map<string, StepExecutor> = new Map();
    protected planner: Planner;

    constructor(params: AgentConstructorParams, planner?: Planner) {
        super(params.chatClient, params.llmService, params.userId, params.taskManager, params.vectorDBService);
        this.planner = planner || new SimpleNextActionPlanner(
            params.llmService,
            params.taskManager,
            params.userId,
            this.modelHelpers,
            this.stepExecutors
        );
    }

    protected async handleChannel(params: HandlerParams): Promise<void> {
        const { projectId } = await this.addNewProject({
            projectName: `Kickoff onboarding based on incoming message: ${params.userPost.message}`,
            tasks: [],
            metadata: {
                originalPostId: params.userPost.id
            }
        });
        const project = await this.projects.getProject(projectId);

        params.projects = [...params.projects || [], project]
        const plan = await this.planSteps(params);
        await this.executeNextStep(projectId, params.userPost);
    }

    protected async handlerThread(params: HandlerParams): Promise<void> {
        const project = params.projects?.[0];

        // If no active project, treat it as a new conversation
        if (!project) {
            Logger.info("No active project found, starting new conversation");
            const { projectId } = await this.addNewProject({
                projectName: params.userPost.message,
                tasks: [],
                metadata: {
                    originalPostId: params.userPost.id
                }
            });
            const project = await this.projects.getProject(projectId);
            params.projects = [...params.projects || [], project]

            const plan = await this.planSteps(params);
            await this.executeNextStep(projectId, params.userPost);
            return;
        }

        // Handle response to existing project
        const currentTask = Object.values(project.tasks).find(t => t.inProgress);
        if (!currentTask) {
            Logger.info("No active task, treating as new query in existing project");
            const plan = await this.planSteps(params);
            await this.executeNextStep(project.id, params.userPost);
            return;
        }

        // Handle response to active task
        const plan = await this.planSteps(params);
        await this.executeNextStep(project.id, params.userPost);
    }

    protected registerStepExecutor(executor: StepExecutor): void {
        const metadata = getExecutorMetadata(executor.constructor);
        if (metadata) {
            // Use decorator metadata if available
            this.stepExecutors.set(metadata.key, executor);
            //todo: not great to duplicate this list
            if (this.planner.stepExecutors) {
                this.planner.stepExecutors.set(metadata.key, executor);
            }
        } else {
            Logger.warn(`No metadata or description found for executor ${executor.constructor.name}`);
        }
    }

    protected async planSteps(handlerParams: HandlerParams): Promise<PlanStepsResponse> {
        const steps = await this.planner.planSteps(handlerParams);
        
        // Send a progress message about the next steps
        const nextStepsMessage = steps.steps?
            steps.steps.map((step, index) => `${index + 1}. ${step.actionType}`)
            .join('\n') : "No steps provided";
        
        if (handlerParams.userPost) {
            await this.reply(handlerParams.userPost, {
                message: `🔄 Planning next steps:\n${nextStepsMessage}`
            });
        }
        
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

    protected async processTask(task: Task): Promise<void> {
        try {
            // Create a synthetic post to represent the task
            const syntheticPost = InMemoryPost.fromLoad({
                id: task.id,
                message: task.description,
                user_id: task.creator,
                channel_id: '', // Could be set to a specific channel if needed
                create_at: Date.now(),
                props: {},
                directed_at: ''
            });

            // Get or create a project for this task
            const { projectId } = await this.addNewProject({
                projectName: `Task: ${task.description}`,
                tasks: [],
                metadata: {
                    originalTaskId: task.id
                }
            });
            const project = await this.projects.getProject(projectId);

            // Plan and execute steps
            const params: HandlerParams = {
                userPost: syntheticPost,
                projects: [project]
            };
            
            const plan = await this.planSteps(params);
            await this.executeNextStep(projectId, syntheticPost);

        } catch (error) {
            Logger.error(`Error processing task ${task.id}`, error);
            // You might want to mark the task as failed or handle the error differently
        }
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

                    //TODO: hacky, we don't really post this message
                    await this.planSteps({
                        projects: [project], 
                        userPost: InMemoryPost.fromLoad({
                            ...userPost,
                            message: planningPrompt
                        })
                    });
                }
            }
            
            if (stepResult.finished) {
                this.projects.completeTask(task.id);
                Logger.info(`Completed step "${task.type}" for project "${projectId}"`);

                // If this was the last planned task, add a validation step
                const remainingTasks = this.projects.getAllTasks(projectId).filter(t => !t.complete);
                if (task.type !== 'validation' && remainingTasks.length === 0) {
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

            // Only send replies if we have a userPost to reply to
            if (userPost) {
                if (stepResult.needsUserInput && stepResult.response) {
                    await this.reply(userPost, stepResult.response, {
                        "project-id": stepResult.projectId||projectId
                    });
                    return;
                } else {
                    const message = stepResult.response?.reasoning || stepResult.response?.message ||"";
                    await this.reply(userPost, {
                        message: `${message} [Finished ${task.type}, still working...]`
                    }, {
                        "project-id": stepResult.projectId||projectId
                    });
                }
            } else {
                // Log progress when no userPost is available
                const message = stepResult.response?.reasoning || stepResult.response?.message ||"";
                Logger.info(`Task progress: ${message} [Finished ${task.type}, continuing...]`);
            }

            await this.executeNextStep(projectId, userPost);

        } catch (error) {
            Logger.error(`Error in step execution ${task.description}`, error);
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


    protected async generateAndSendFinalResponse(projectId: string, userPost?: ChatPost): Promise<void> {
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

        if (userPost) {
            await this.reply(userPost, response);
        } else {
            Logger.info(`Final response for project ${projectId}: ${response.message}`);
        }
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
