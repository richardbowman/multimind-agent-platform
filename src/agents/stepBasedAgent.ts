import 'reflect-metadata';
import { Agent, PlannerParams } from './agents';
import { TaskEventType } from "../shared/TaskEventType";
import { getExecutorMetadata } from './decorators/executorDecorator';
import { ChatPost, isValidChatPost, Message } from '../chat/chatClient';
import { HandlerParams } from './agents';
import { AgentConstructorParams } from './interfaces/AgentConstructorParams';
import { AddTaskParams, Project, Task, TaskManager, TaskType } from '../tools/taskManager';
import { TaskStatus } from 'src/schemas/TaskStatus';
import { Planner } from './planners/planner';
import { PlanStepsResponse } from '../schemas/PlanStepsResponse';
import { AgentConfig } from 'src/tools/AgentConfig';
import { ReplanType, StepResponse, StepResult, StepResultType } from './interfaces/StepResult';
import { StepExecutor } from './interfaces/StepExecutor';
import { ExecuteContext, ExecuteNextStepParams } from './interfaces/ExecuteNextStepParams';
import { ExecuteStepParams, StepTask } from './interfaces/ExecuteStepParams';
import { ModelHelpers } from 'src/llm/modelHelpers';
import { ExecutorType } from './interfaces/ExecutorType';
import { asUUID, UUID } from 'src/types/uuid';
import { Artifact } from 'src/tools/artifact';
import Logger from '../helpers/logger';
import { ExecutorConstructorParams } from './interfaces/ExecutorConstructorParams';
import { StringUtils } from 'src/utils/StringUtils';

interface ExecutorCapability {
    stepType: string;
    description: string;
    exampleInput?: string;
    exampleOutput?: string;
}

export class ModelResponseError extends Error {
    constructor(message: string, public modelResponse: string, options?: ErrorOptions) {
        super(message, options);
    }
}

export abstract class StepBasedAgent extends Agent {
    protected stepExecutors: Map<string, StepExecutor<StepResponse>> = new Map();
    protected planner: Planner | null;

    constructor(params: AgentConstructorParams, planner?: Planner) {
        super(params);
        this.planner = planner;
    }

    protected getExecutorParams() : ExecutorConstructorParams {
        // Create standardized params
        const executorParams = {
            llmService: this.llmService,
            llmServices: this.llmServices,
            taskManager: this.projects,
            artifactManager: this.artifactManager,
            vectorDBService: this.vectorDBService,
            userId: this.userId,
            chatClient: this.chatClient,
            vectorDB: this.vectorDBService,
            modelHelpers: new ModelHelpers({
                llmService: this.llmService,
                llmServices: this.llmServices,
                userId: this.userId,
                messagingHandle: this.messagingHandle,
                purpose: this.modelHelpers.getPurpose(),
                finalInstructions: this.modelHelpers.getFinalInstructions(),
                context: this.buildLLMContext()
            }),
            settings: this.settings
        };
        executorParams.modelHelpers.setPurpose(this.modelHelpers.getPurpose())
        return executorParams;
    }

    public async onReady(): Promise<void> {
        await this.processTaskQueue();
    }

    protected async initializeFromConfig(config: AgentConfig): Promise<void> {
        // Set agent instructions
        this.modelHelpers.setPurpose(config.purpose);
        this.modelHelpers.setFinalInstructions(config.finalInstructions);

        // Initialize executors
        for (const executorConfig of config.executors) {
            try {
                // Use require.context to load executors
                const executorContext = (require as any).context('./executors', true, /\.ts$/);
                const name = StringUtils.isString(executorConfig) ? executorConfig : `./${executorConfig.className}.ts`;
                const module = executorContext(name);
                const ExecutorClass = module[executorConfig.className] || module.default;

                Logger.info(`Initializing ${executorConfig.className} executor `)

                // Create instance with config
                const executor = new ExecutorClass({
                    ...this.getExecutorParams(),
                    ...executorConfig.config
                });

                this.registerStepExecutor(executor);
            } catch (error) {
                Logger.error(`Failed to initialize executor ${executorConfig.className}:`, error);
            }
        }
    }

    static async getRootTask(taskId: UUID, projects: TaskManager, depth?: number): Promise<Task | null> {
        // handle weird issues
        if (depth == 10) {
            Logger.error(`Recursive getRootTask call with ${taskId}.`);
            return null;
        }

        const task = await projects.getTaskById(taskId);
        if (!task) return null;

        const project = await projects.getProject(task.projectId);
        if (!project.metadata.parentTaskId) {
            return task; // This is the root task
        }

        // Recursively find the root task
        return StepBasedAgent.getRootTask(project.metadata.parentTaskId, projects, (depth || 0) + 1);
    }

    protected async taskNotification(task: Task, eventType: TaskEventType): Promise<void> {
        const isMine = task.assignee === this.userId;

        const stepTask: StepTask<StepResponse> | undefined = task.type === TaskType.Step ? task as StepTask<StepResponse> : undefined;
        const userPost = stepTask?.props.userPostId && await this.chatClient.getPost(stepTask.props.userPostId);
        const posts = userPost && await this.chatClient.getThreadChain(userPost);

        // jump-start the step execution if an async step finishes
        if (isMine && eventType === TaskEventType.Completed && stepTask?.props?.result?.async) {
            const executor = this.stepExecutors.get(stepTask.props?.stepType);
            if (executor && typeof executor.onChildProjectComplete === 'function') {
                const statusPost =  posts?.find(p => p.props?.partial);
                const childProject = await this.projects.getProject(stepTask.props?.childProjectId);
                const stepResult = await executor.onChildProjectComplete(stepTask, childProject);
                const artifactIds = stepResult?.artifactIds;
                
                const artifacts = artifactIds && await this.mapRequestedArtifacts(artifactIds);  // don't think is the right list to rehydrate from really

                const stepProject = await this.projects.getProject(stepTask?.projectId);
                const projectTask = stepProject.metadata.parentTaskId && await this.projects.getTaskById(stepProject.metadata.parentTaskId);


                const params : ExecuteStepParams<StepResponse> = {
                    task: stepTask,
                    userPost,
                    projectId: stepTask.projectId,
                    projectTask: projectTask !== null ? projectTask: undefined,
                    partialPost: statusPost,
                    context: {
                        threadPosts: posts,
                        artifacts
                    }
                }

                await this.handleStepCompletion(params, stepResult);
            }
        } else if (task.creator === this.userId && task.type === TaskType.Standard) {
            const parentTask = await StepBasedAgent.getRootTask(task.id, this.projects);

            if (parentTask && parentTask.creator === this.userId && parentTask.type === TaskType.Step) {
                const postId = (parentTask as StepTask<StepResponse>).props.userPostId;
                const post = postId && await this.chatClient.getPost(postId);
                const posts: ChatPost[] | undefined = post && await this.chatClient.getThreadChain(post);

                if (posts) {
                    const statusPost = posts.find(p => p.props?.partial);

                    // Find the executor for the root task
                    const executor = this.stepExecutors.get((parentTask as StepTask<StepResponse>).props.stepType);
                    if (executor && typeof executor.handleTaskNotification === 'function') {
                        await executor.handleTaskNotification({
                            task: parentTask,
                            childTask: task,
                            eventType,
                            statusPost
                        });
                    } else {
                        if (statusPost) {
                            await this.chatClient.updatePost(statusPost.id, task.description);
                        } else if (post) {
                            await this.reply(post, { message: task.description }, {
                                partial: true,
                                "project-ids": [parentTask.projectId]
                            });
                        }
                    }
                }
            }
        }

        super.taskNotification(task, eventType);
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
        const execParams: ExecuteNextStepParams = {
            projectId,
            userPost: params.userPost,
            context: {
                channelId: params.userPost?.channel_id,
                threadId: params.userPost?.thread_id,
                projects: params.projects,
                artifacts: params.artifacts,
                threadPosts: [...params.threadPosts||[], params.userPost]
            }
        };
        const plan = await this.planSteps(execParams);
        await this.executeNextStep(execParams);
    }

    protected async handlerThread(params: HandlerParams): Promise<void> {
        const { id: projectId } = params.projects?.filter(p => p.metadata.tags?.includes("agent-internal-steps"))[0] || { id: undefined };

        const executionContext = {
            channelId: params.userPost?.channel_id,
            threadId: params.userPost?.thread_id,
            projects: params.projects,
            artifacts: params.artifacts,
            threadPosts: [...params.rootPost?[params.rootPost]:[], ...params.threadPosts||[], params.userPost]
        };

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
            const execParams: ExecuteNextStepParams = {
                projectId,
                userPost: params.userPost,
                context: executionContext
            };
            const plan = await this.planSteps(execParams);
            await this.executeNextStep(execParams);
            return;
        }

        // Handle response to existing project
        const task = await this.projects.getNextTask(projectId, TaskType.Step);

        const execParams: ExecuteNextStepParams = {
            projectId,
            userPost: params.userPost,
            context: executionContext
        };

        if (!task) {
            Logger.info("No remaining tasks, planning new steps");
            const plan = await this.planSteps(execParams);
        }

        // Continue with existing tasks without replanning
        await this.executeNextStep(execParams);
    }

    protected registerStepExecutor(executor: StepExecutor<StepResponse>): void {
        const metadata = getExecutorMetadata(executor.constructor);
        if (metadata) {
            // Use decorator metadata if available
            this.stepExecutors.set(metadata.key, executor);
            //todo: not great to duplicate this list
            if (this.planner?.stepExecutors) {
                this.planner?.stepExecutors.set(metadata.key, executor);
            }
        } else {
            Logger.warn(`No metadata or description found for executor ${executor.constructor.name}`);
        }
    }

    public getExecutorCapabilities(): Array<ExecutorCapability> {
        const capabilities: ExecutorCapability[] = [];
        for (const [key, executor] of this.stepExecutors) {
            const metadata = getExecutorMetadata(executor.constructor);
            if (metadata) {
                capabilities.push({
                    stepType: key,
                    description: metadata.description,
                    exampleInput: metadata.exampleInput,
                    exampleOutput: metadata.exampleOutput
                });
            }
        }
        return capabilities;
    }

    protected async planSteps(params: ExecuteNextStepParams): Promise<PlanStepsResponse> {
        const project = await this.projects.getProject(params.projectId);
        const plannerParams: PlannerParams = {
            projects: [project],
            threadPosts: params.context?.threadPosts,
            userPost: params.userPost,
            artifacts: params.context?.artifacts
        };

        if (!this.planner) {
            const goal = plannerParams.userPost ? `Reply to incoming message: ${plannerParams.userPost?.message}` : `Solve task: '${params.projectTask?.description}' as part of project '${project.name}'`;
            const newTask: AddTaskParams = {
                type: TaskType.Step,
                description: goal,
                creator: this.userId,
                props: {
                    stepType: ExecutorType.NEXT_STEP
                }
            };
            await this.projects.addTask(project, newTask);
            return {
                reasoning: goal,
                steps: [{
                    actionType: ExecutorType.NEXT_STEP,
                    context: "None"
                }]
            }
        } else {
            const steps = await this.planner.planSteps(plannerParams);

            // Send a progress message about the next steps
            const nextStepsMessage = steps.steps ?
                steps.steps.map((step, index) => `${index + 1}. ${step.actionType}`)
                    .join('\n') : "No steps provided";

            if (isValidChatPost(params.userPost)) {
                const partialPostFn = this.getPartialPost(params.userPost, params);
                await partialPostFn(`🔄 Planning next steps:\n${nextStepsMessage}`);
            }
            return steps;
        }
    }

    protected async executeNextStep(params: ExecuteNextStepParams): Promise<void> {
        const { projectId } = params;

        const task = await this.projects.getNextTask(projectId, TaskType.Step) as StepTask<StepResponse>;

        if (!task) {
            Logger.warn('No tasks found to execute');
            return;
        }

        await this.projects.markTaskInProgress(task);
        await this.executeStep({
            ...params,
            task
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
                // .filter(t => t.type === TaskType.Step) - we don't want this, we also roll up results from delegation
                .map(t => (t as StepTask<StepResponse>).props?.result)
                .filter(r => r !== undefined);

            const completedResponses = completedResults
                .map(t => t.response);


            // Combine all results into one
            const combinedResult = completedResponses?.map(r => r?.message)     // removing reasoning to try and keep as clean as possible -- || r?.reasoning
                .filter(msg => msg)
                .join('\n\n');

            // Get artifacts associated to the subproject
            const childArtifactIds = completedResults.flatMap(r => r.artifactIds).filter(r => r !== undefined);


            await this.projects.updateTask(parentTask.id, {
                props: {
                    ...parentTask.props,
                    result: {
                        ...parentTask.props?.result,
                        artifactIds: [...new Set([...parentTask.props?.result?.artifactIds || [], ...childArtifactIds])],
                        response: {
                            ...parentTask.props?.result?.response,
                            status: combinedResult,
                            subProjectResults: completedResults
                        }
                    }
                }
            });

            await this.projects.assignTaskToAgent(project.metadata.parentTaskId, this.userId);
            await this.projects.completeTask(project.metadata.parentTaskId);
        }
    }

    protected async processTask(task: Task): Promise<void> {
        try {
            // Get or create a project for this task
            const { projectId } = await this.addNewProject({
                projectName: `Task: ${task.description}`,
                tasks: [],
                metadata: {
                    parentTaskId: task.id,
                    parentProjectId: task.projectId
                }
            });

            // Update parent task with child project reference
            await this.projects.updateTask(task.id, {
                props: {
                    ...task.props,
                    childProjectId: projectId
                }
            });

            let context: Partial<ExecuteContext> = {};
            let post: Message | undefined = undefined;      //TODO: we shouild be able to look this up
            if (task.props?.announceChannelId !== undefined) {
                const handles = await this.chatClient.getHandles();
                const creatorHandle = handles[task.creator];
                const assigneeHandle = task.assignee && handles[task.assignee];

                context.channelId = asUUID(task.props.announceChannelId);
                post = await this.chatClient.postInChannel(context.channelId,
                    `@user We have been requested to execute task ${task.id} created by ${creatorHandle} ${task.description} ${assigneeHandle ? `assigned to ${assigneeHandle}` : ''}}`);
                context.threadId = post.id;
            }

            const parentProject = await this.projects.getProject(task.projectId);

            const artifacts = task.props?.attachedArtifactIds?.length || 0 > 0 ? await this.mapRequestedArtifacts(task.props?.attachedArtifactIds!) : [];

            const execParams: ExecuteNextStepParams = {
                projectId,
                userPost: post,
                projectTask: task,
                context: {
                    ...context,
                    projects: [parentProject],
                    artifacts,
                }
            };

            const plan = await this.planSteps(execParams);

            await this.executeNextStep(execParams);

        } catch (error) {
            Logger.error(`Error processing task ${task.id}`, error);
            // You might want to mark the task as failed or handle the error differently
        }
    }

    private getPartialPost(replyTo: ChatPost | undefined, params: ExecuteNextStepParams) {
        const partialResponse = async (message, newOnly = false) : Promise<ChatPost|undefined> => {
            if (replyTo) {
                if (!params.partialPost) {
                    const statusPost = await this.reply(replyTo, {
                        message
                    }, {
                        partial: true,
                        "project-ids": [params.projectId],
                        "artifactIds": params.context?.artifacts?.map(a => a.id)
                    });
                    params.partialPost = statusPost;
                } else if (!newOnly) {
                    // const post = await this.chatClient.getPost(params.partialPost.id);
                    params.partialPost = await this.chatClient.updatePost(params.partialPost.id, message);
                }
            }
            return params.partialPost;
        };
        return partialResponse;
    }

    protected async executeStep(params: ExecuteStepParams<StepResponse>): Promise<void> {
        const { projectId, task, userPost, context } = params;
        try {
            // Handle step types that may be wrapped in square brackets
            const stepType = task.props.stepType.replace(/^\[|\]$/g, '');
            const executor = this.stepExecutors.get(stepType);
            let stepResult: StepResult<StepResponse>;

            if (!executor) {
                const error = `Step type '${stepType}' not supported. Only use available types.`;
                Logger.error(error);
                stepResult = {
                    finished: true,
                    replan: ReplanType.Force,
                    type: StepResultType.Error,
                    response: {
                        status: error
                    }
                }
            } else {

                Logger.info(`Executing step "${task.props.stepType}" for project "${projectId}"`);

                const project = await this.projects.getProject(projectId);
                if (!project) {
                    throw new Error(`Project ${projectId} not found`);
                }

                // get overall goals
                let channelGoals: Task[] = [];
                let agentsOptions: Agent[] = [];
                if (context?.channelId) {
                    const channelData = await this.chatClient.getChannelData(context?.channelId);
                    const channelProject = channelData?.projectId
                        ? await this.projects.getProject(channelData.projectId)
                        : null;
                    channelGoals = [
                        ...channelGoals,
                        ...Object.values(channelProject?.tasks || {})
                    ]

                    // Get agent descriptions from settings for channel members
                    agentsOptions = (channelData.members || [])
                        .filter(memberId => this.userId !== memberId)
                        .map(memberId => {
                            return this.agents.agents[memberId];
                        }).defined();
                } else {
                    agentsOptions = Object.values(this.agents.agents).filter(a => a.userId).map(id => {
                        return this.agents.agents[id.userId];
                    }).filter(a => a !== undefined);
                }

                const self = Object.values(this.agents.agents).find(a => a.userId === this.userId);
                if (!self) {
                    throw new Error("Could not find the current agent in step processing");
                }

                // Get all prior completed tasks' results
                const tasks = await this.projects.getProjectTasks(projectId);
                const priorSteps = tasks
                    .filter(t => t.type === "step")
                    .map(t => t as StepTask<StepResponse>)
                    .filter(t => (t.complete || t.inProgress))
                    .sort((a, b) => (a.order || 0) - (b.order || 0));

                const priorResults = priorSteps
                    .map(t => t.props?.result)
                    .filter(r => r !== undefined && r !== null)
                    .map(s => s?.response)
                    .filter(r => r); // Remove undefined/null results


                if (executor.execute) {
                    stepResult = await executor.execute({
                        agentId: this.userId,
                        goal: `[Step: ${task.description}] [Project: ${project.name}] Solve the user's request: ${userPost?.message}`,
                        step: task.props.stepType,
                        stepId: task.id,
                        channelGoals,
                        projectId: projectId,
                        previousResponses: priorResults,
                        steps: priorSteps,
                        message: userPost?.message,
                        userPost: userPost,
                        stepGoal: task.description,
                        overallGoal: project.name,
                        executionMode: userPost ? 'conversation' : 'task',
                        agents: agentsOptions,
                        self,
                        context: {
                            channelId: userPost?.channel_id,
                            threadId: userPost?.thread_id,
                            threadPosts: params.context?.threadPosts,
                            artifacts: params.context?.artifacts,
                            projects: params.context?.projects
                        },
                        partialResponse: this.getPartialPost(userPost, params)
                    });
                } else {
                    stepResult = await executor.executeOld(
                        `[Step: ${task.description}] [Project: ${project.name}] ${userPost?.message}`,
                        task.props.stepType,
                        projectId,
                        priorResults
                    );
                }
            }

            await this.handleStepCompletion(params, stepResult);
        } catch (error) {
            Logger.error(`Error in step execution ${task.description}`, error);
            if (userPost) await this.reply(userPost, { message: "Sorry, I encountered an error while processing your request." });
        }
    }

    protected async handleStepCompletion(params: ExecuteStepParams<StepResponse>, stepResult: StepResult<StepResponse>) {
        const { task, userPost, projectTask } = params;
        const { projectId } = task;
        const project = await this.projects.getProject(projectId);
        
        let replyTo: ChatPost | undefined;
        if (userPost && isValidChatPost(userPost)) {
            replyTo = userPost;
        } else if (project.metadata.originalPostId) {
            replyTo = await this.chatClient.getPost(project.metadata.originalPostId);
        }

        //TODO: figure out how to handle restated goals
        // step wants to revise overall goal
        // if (stepResult.goal) {
        //     project.name = stepResult.goal;
        // }

        // check to see if user cancelled steps (run-away?)
        const checkTask = await this.projects.getTaskById(task.id);
        const checkParentTask = project.metadata?.parentTaskId && await this.projects.getTaskById(project.metadata.parentTaskId);
        if (!checkTask || checkTask?.status === TaskStatus.Cancelled || checkParentTask?.status === TaskStatus.Cancelled) {
            Logger.info("Step task was cancelled, aborting process");
            return;
        }


        if (stepResult.projectId) {
            const newProject = await this.projects.getProject(stepResult.projectId);
            newProject.metadata.parentTaskId = task.id;
            //TODO need a way to update project to disk
        }
        
        // check if they provided artifact objects for us to save
        const createdArtifacts : UUID[] = [];
        if (stepResult.response.artifacts?.length||0 > 0) {
            const artifacts = await Promise.all<Artifact>(stepResult.response.artifacts!.map(a => this.artifactManager.saveArtifact(a)));
            const ids = artifacts.map(a => a.id);
            createdArtifacts.push(...ids);
            delete stepResult.response.artifacts;
        }
        
        const artifactList : UUID[] = [...new Set([...params.context?.artifacts?.map(a => a.id)||[],
            ...createdArtifacts || [], 
            ...stepResult.artifactIds || [], 
            ...stepResult.response?.artifactIds || [], 
            ...stepResult.response?.data?.artifactId?[stepResult.response?.data?.artifactId]:[]])];

        const props = {
            "project-ids": [...stepResult.projectId?[stepResult.projectId]:[], projectId],
            artifactIds: artifactList
        };
        
        if (stepResult.response.status) {
            const partialPostFn = this.getPartialPost(replyTo, { ...params, ...props });
            params.partialPost = await partialPostFn(stepResult.response.status);
        }

        // Only send replies if we have a userPost to reply to
        let lastPost : ChatPost;
        if (replyTo && stepResult.response.message) {
            const messageResponse = {
                message: stepResult.response?.message
            }
            if (params.partialPost) {
                lastPost = await this.chatClient.updatePost(
                    (params.partialPost as ChatPost).id,
                    messageResponse.message,
                    {
                        ...props,
                        partial: false
                    });
                params.partialPost = undefined;
            } else {
                lastPost = await this.reply(replyTo, messageResponse, props);
            }
        }

        // Store the result in task props
        await this.projects.updateTask(task.id, {
            props: {
                ...(stepResult.projectId && {
                    ...task.props,
                    childProjectId: stepResult.projectId
                }) ?? task.props,
                result: stepResult,
                awaitingResponse: stepResult.needsUserInput,
                userPostId: userPost?.id,
                partialPostId: params.partialPost?.id,
                responsePostId: lastPost?.id
            }
        } as Partial<StepTask<StepResponse>>);

        if (stepResult.finished || this.planner?.alwaysComplete) {
            // If this was the last planned task, add a validation step
            const remainingTasks = (await this.projects.getProjectTasks(projectId)).filter(t => !t.complete && t.type === "step" && t.id !== task.id);
            const stepArtifacts =   await this.mapRequestedArtifacts(artifactList);

            if ((stepResult.replan === ReplanType.Allow && remainingTasks.length === 0) || stepResult.replan === ReplanType.Force) {
                //TODO: hacky, we don't really post this message
                if (!this.planner || this.planner.allowReplan) {
                    await this.planSteps({
                    projectId,
                    userPost,
                    projectTask,
                    task,
                    context: {
                        ...params.context,
                        artifacts: stepArtifacts
                    },
                    partialPost: params.partialPost
                });
                }
            }

            const updatedTask = await this.projects.completeTask(task.id);
            Logger.info(`Completed step "${task.props.stepType}" for project "${projectId}"`);
            
            if (!stepResult.needsUserInput) {

                await this.executeNextStep({
                    projectId,
                    userPost,
                    projectTask,
                    context: {
                        ...params.context,
                        artifacts: stepArtifacts
                    },
                    partialPost: params.partialPost
                });
            }

        } else {
            // Log progress when no userPost is available
            const message = stepResult.response?.reasoning || stepResult.response?.message || "";
            Logger.info(`Task progress: ${message} [Finished ${task.type}, continuing...]`);
        }
    }

}
