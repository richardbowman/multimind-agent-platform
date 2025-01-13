import { Agent } from './agents';
import { getExecutorMetadata } from './decorators/executorDecorator';
import 'reflect-metadata';
import { ChatPost, isValidChatPost } from '../chat/chatClient';
import { HandleActivity, HandlerParams, ResponseType } from './agents';
import { ILLMService, StructuredOutputPrompt } from "src/llm/ILLMService";
import { AgentConstructorParams } from './interfaces/AgentConstructorParams';
import { Project, Task, TaskManager } from '../tools/taskManager';
import { Planner } from './planners/planner';
import { MultiStepPlanner } from './planners/multiStepPlanner';
import Logger from '../helpers/logger';
import { ModelMessageResponse, ModelResponse } from '../schemas/ModelResponse';
import { PlanStepsResponse } from '../schemas/PlanStepsResponse';
import { InMemoryPost } from 'src/chat/localChatClient';
import { AgentConfig, Settings } from 'src/tools/settingsManager';
import { ArtifactManager } from 'src/tools/artifactManager';
import { IVectorDatabase } from 'src/llm/IVectorDatabase';
import { Artifact } from 'src/tools/artifact';

export interface ExecuteNextStepParams {
    projectId: string;
    userPost?: ChatPost;
    context?: {
        channelId?: string;
        threadId?: string;
        artifacts?: Artifact[];
        projects?: Project[];
    };
}

export interface ExecuteStepParams extends ExecuteNextStepParams {
    task: Task
}

export interface StepResult {
    type?: string;
    projectId?: string;
    taskId?: string;
    finished?: boolean;
    goal?: string;
    allowReplan?: boolean;
    needsUserInput?: boolean;
    response: ModelResponse;
}

export interface ExecuteParams {
    agentId: string;
    message?: string;
    stepGoal?: string;
    overallGoal?: string;
    goal: string;
    step: string;
    projectId: string;
    previousResult?: ModelMessageResponse[];
    mode?: 'quick' | 'detailed';
    agents?: Array<{
        id: string;
        handle: string;
        type: string;
    }>;
    context?: {
        channelId?: string;
        threadId?: string;
        artifacts?: Artifact[];
        projects?: Project[];
    };
}

export interface StepExecutor {
    /**
     * @deprecated Use executeV2 instead which provides better parameter organization
     */
    executeOld?(goal: string, step: string, projectId: string, previousResult?: any): Promise<StepResult>;
    execute?(params: ExecuteParams): Promise<StepResult>;
    onTaskNotification?(task: Task): Promise<void>;
    onProjectCompleted?(project: Project): Promise<void>;
}

export interface ExecutorConstructorParams {
    vectorDB: IVectorDatabase;
    llmService: ILLMService;
    taskManager: TaskManager;
    artifactManager: ArtifactManager;
    settings: Settings,
    userId?: string;
    config?: Record<string, any>;
}

export abstract class StepBasedAgent extends Agent {
    protected stepExecutors: Map<string, StepExecutor> = new Map();
    protected planner: Planner;

    constructor(params: AgentConstructorParams, planner?: Planner) {
        super(params);
        this.planner = planner || new MultiStepPlanner(
            params.llmService,
            params.taskManager,
            params.userId,
            this.modelHelpers,
            this.stepExecutors
        );
    }

    protected async initializeFromConfig(config: AgentConfig): Promise<void> {
        // Set agent instructions
        this.modelHelpers.setPurpose(config.purpose);
        this.modelHelpers.setFinalInstructions(config.finalInstructions);

        // Initialize executors
        for (const executorConfig of config.executors) {
            try {
                // Dynamically import the executor class
                const module = await import(`./executors/${executorConfig.className}`);
                const ExecutorClass = module[executorConfig.className];
                
                // Create instance with config
                const executor = new ExecutorClass({
                    llmService: this.llmService,
                    taskManager: this.projects,
                    artifactManager: this.artifactManager,
                    userId: this.userId,
                    settings: this.settings,
                    ...executorConfig.config
                });
                
                this.registerStepExecutor(executor);
            } catch (error) {
                Logger.error(`Failed to initialize executor ${executorConfig.className}:`, error);
            }
        }
    }

    protected async handleChannel(params: HandlerParams): Promise<void> {
        const { projectId } = await this.addNewProject({
            projectName: `Answer the user's request: ${params.userPost.message}`,
            tasks: [],
            metadata: {
                originalPostId: params.userPost.id,
                tags: ["agent-internal-steps"]
            }
        });

        const project = await this.projects.getProject(projectId);
        params.projects = [...params.projects || [], project];
        
        const posts = [params.userPost];
        const plan = await this.planSteps(projectId, posts);
        await this.executeNextStep({
            projectId,
            userPost: params.userPost,
            context: {
                channelId: params.userPost?.channel_id,
                threadId: params.userPost?.thread_id,
                projects: params.projects
            }
        });
    }

    protected async handlerThread(params: HandlerParams): Promise<void> {
        const { id: projectId } = params.projects?.filter(p => p.metadata.tags?.includes("agent-internal-steps"))[0]||{id: undefined};

        // If no active project, treat it as a new conversation
        if (!projectId) {
            Logger.info("No active project found, starting new conversation");
            let { projectId } = await this.addNewProject({
                projectName: params.userPost.message,
                tasks: [],
                metadata: {
                    originalPostId: params.userPost.id
                }
            });

            const plan = await this.planSteps(projectId, [params.rootPost||{message: "(missing root post)"}, ...params.threadPosts||[], params.userPost]);
            await this.executeNextStep({
                projectId,
                userPost: params.userPost,
                context: {
                    channelId: params.userPost?.channel_id,
                    threadId: params.userPost?.thread_id,
                    projects: params.projects
                }
            });
            return;
        }

        // Handle response to existing project
        const task = this.projects.getNextTask(projectId);

        if (!task) {
            Logger.info("No remaining tasks, planning new steps");
            const plan = await this.planSteps(projectId, [params.rootPost||{message: "(missing root post)"},...params.threadPosts||[], params.userPost]);
        }

        // Continue with existing tasks without replanning
        await this.executeNextStep({
            projectId,
            userPost: params.userPost,
            context: {
                channelId: params.userPost?.channel_id,
                threadId: params.userPost?.thread_id,
                projects: params.projects
            }
        });
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

    protected async planSteps(projectId: string, posts: ChatPost[]): Promise<PlanStepsResponse> {
        const project = await this.projects.getProject(projectId);
        const handlerParams: HandlerParams = {
            projects: [project],
            threadPosts: posts?.slice(0,-1),
            userPost: posts?.[posts?.length - 1]
        };
        const steps = await this.planner.planSteps(handlerParams);

        // Send a progress message about the next steps
        const nextStepsMessage = steps.steps ?
            steps.steps.map((step, index) => `${index + 1}. ${step.actionType}`)
                .join('\n') : "No steps provided";

        if (isValidChatPost(handlerParams.userPost)) {
            await this.reply(handlerParams.userPost, {
                message: `🔄 Planning next steps:\n${nextStepsMessage}`
            }, {
                "project-id": handlerParams.projects?.[0]
            });
        }

        return steps;
    }

    protected async executeNextStep(params: ExecuteNextStepParams): Promise<void> {
        const { projectId, userPost, context } = params;
        const task = this.projects.getNextTask(projectId);
        if (!task) {
            Logger.warn('No tasks found to execute');
            return;
        }
        this.projects.markTaskInProgress(task);
        await this.executeStep({
            projectId,
            task,
            userPost,
            context: {
                channelId: params.userPost?.channel_id,
                threadId: params.userPost?.thread_id,
                projects: params.projects
            }
        });
    }

    protected async projectCompleted(project: Project): Promise<void> {
        Logger.info(`Project ${project.id} completed`);
        if (project.metadata.parentTaskId) {
            // Update parent task with combined results
            const parentTask = await this.projects.getTaskById(project.metadata.parentTaskId);

            if (!parentTask) {
                Logger.warn(`Could not find parent task ${project.metadata.parentTaskId}`);
                return;
            }

            // Get all completed tasks' results
            const tasks = Object.values(project.tasks);
            const completedResults = tasks
                .filter(t => t.complete)
                .map(t => t.props?.result)
                .filter(r => r);

            // Combine all results into one
            const combinedResult = completedResults
                .map(r => r.message || r.reasoning || '')
                .filter(msg => msg)
                .join('\n\n');

            if (!parentTask.props) parentTask.props = {};
            parentTask.props.result = {
                message: combinedResult,
                subProjectResults: completedResults
            };

            await this.projects.assignTaskToAgent(project.metadata.parentTaskId, this.userId);
            const parentProject = await this.projects.getProject(parentTask.projectId);

            // Store the combined results in the project's metadata
            parentProject.metadata.subProjectResults = completedResults;

            this.projects.completeTask(project.metadata.parentTaskId);
        }
    }

    protected async processTask(task: Task): Promise<void> {
        try {
            // Get or create a project for this task
            const { projectId } = await this.addNewProject({
                projectName: `Task: ${task.description}`,
                tasks: [],
                metadata: {
                    parentTaskId: task.id
                }
            });

            const plan = await this.planSteps(projectId, [{
                message: task.description
            }]);

            await this.executeNextStep({
                projectId,
                context: {
                    projects: params.projects
                }
            });

        } catch (error) {
            Logger.error(`Error processing task ${task.id}`, error);
            // You might want to mark the task as failed or handle the error differently
        }
    }

    protected async executeStep(params: ExecuteStepParams): Promise<void> {
        const { projectId, task, userPost, context } = params;
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
                .filter(t => t.complete || t.inProgress && t.order !== undefined && t.order < (task.order || Infinity))
                .sort((a, b) => (a.order || 0) - (b.order || 0))
                .map(t => t.props?.result)
                .filter(r => r); // Remove undefined/null results

            let stepResult: StepResult;
            if (executor.execute) {
                stepResult = await executor.execute({
                    agentId: this.userId,
                    goal: `[Step: ${task.description}] [Project: ${project.name}] ${userPost?.message}`,
                    step: task.type,
                    projectId: projectId,
                    previousResult: priorResults,
                    message: userPost?.message,
                    stepGoal: task.description,
                    overallGoal: project.name,
                    context: {
                        channelId: userPost?.channel_id,
                        threadId: userPost?.thread_id,
                        artifacts: await this.artifactManager.getArtifacts({
                            projectId,
                            task: task.type
                        }),
                        projects: params.projects || []
                    }
                });
            } else {
                stepResult = await executor.executeOld(
                    `[Step: ${task.description}] [Project: ${project.name}] ${userPost?.message}`,
                    task.type,
                    projectId,
                    priorResults
                );
            }

            // step wants to revise overall goal
            if (stepResult.goal) {
                project.name = stepResult.goal;
            }

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
                    await this.planSteps(project.id, [InMemoryPost.fromLoad({
                            ...userPost,
                            message: planningPrompt
                        })]
                    );
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
                        "project-id": stepResult.projectId || projectId
                    });
                } else {
                    const message = stepResult.response?.reasoning || stepResult.response?.message || "";
                    await this.reply(userPost, {
                        message: `${message} [Finished ${task.type}, still working...]`
                    }, {
                        "project-id": stepResult.projectId || projectId,
                        "artifact-ids": [...stepResult.response?.artifactIds||[], stepResult.response?.data?.artifactId]
                    });
                }
            }

            if (stepResult.finished) {
                this.projects.completeTask(task.id);
                Logger.info(`Completed step "${task.type}" for project "${projectId}"`);

                // If this was the last planned task, add a validation step
                const remainingTasks = this.projects.getAllTasks(projectId).filter(t => !t.complete);
                if (stepResult.allowReplan && remainingTasks.length === 0) {
                    // const validationTask: Task = {
                    //     id: crypto.randomUUID(),
                    //     type: 'validation',
                    //     description: 'Validate solution completeness',
                    //     creator: this.userId,
                    //     complete: false,
                    //     order: (task.order || 0) + 1
                    // };
                    // this.projects.addTask(project, validationTask);

                    //TODO: hacky, we don't really post this message
                    await this.planSteps(project.id, [InMemoryPost.fromLoad({
                        ...userPost,
                        message: `Replanning requested after ${stepResult.type} step completed`
                    })]);
                }

                if (!stepResult.needsUserInput) {
                    await this.executeNextStep(projectId, userPost);
                }

            } else {
                // Log progress when no userPost is available
                const message = stepResult.response?.reasoning || stepResult.response?.message || "";
                Logger.info(`Task progress: ${message} [Finished ${task.type}, continuing...]`);
            }
        } catch (error) {
            Logger.error(`Error in step execution ${task.description}`, error);
            if (userPost) await this.reply(userPost, { message: "Sorry, I encountered an error while processing your request." });
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
        await this.executeNextStep({
            projectId: project.id,
            userPost: params.userPost,
            context: {
                channelId: params.userPost?.channel_id,
                threadId: params.userPost?.thread_id,
                projects: params.projects
            }
        });
    }
}
