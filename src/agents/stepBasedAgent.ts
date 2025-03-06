import { Agent, PlannerParams, TaskEventType } from './agents';
import { getExecutorMetadata } from './decorators/executorDecorator';
import 'reflect-metadata';
import { ChatPost, isValidChatPost, Message } from '../chat/chatClient';
import { HandleActivity, HandlerParams, ResponseType } from './agents';
import { AgentConstructorParams } from './interfaces/AgentConstructorParams';
import { AddTaskParams, Project, Task, TaskManager, TaskType } from '../tools/taskManager';
import { TaskStatus } from 'src/schemas/TaskStatus';
import { Planner } from './planners/planner';
import { MultiStepPlanner } from './planners/multiStepPlanner';
import Logger from '../helpers/logger';
import { PlanStepsResponse } from '../schemas/PlanStepsResponse';
import { InMemoryPost } from 'src/chat/localChatClient';
import { AgentConfig } from 'src/tools/settings';
import { ReplanType, StepResponse, StepResult } from './interfaces/StepResult';
import { StepExecutor } from './interfaces/StepExecutor';
import { ExecuteContext, ExecuteNextStepParams } from './interfaces/ExecuteNextStepParams';
import { ExecuteStepParams, StepTask } from './interfaces/ExecuteStepParams';
import { pathExists } from 'fs-extra';
import { ModelHelpers } from 'src/llm/modelHelpers';
import { ExecutorType } from './interfaces/ExecutorType';
import { exec } from 'child_process';
import { asUUID, UUID } from 'src/types/uuid';
import { ArrayUtils } from 'src/utils/ArrayUtils';
import { Artifact } from 'src/tools/artifact';

interface ExecutorCapability {
    stepType: string;
    description: string;
    exampleInput?: string;
    exampleOutput?: string;
}

export abstract class StepBasedAgent extends Agent {
    protected stepExecutors: Map<string, StepExecutor<StepResponse>> = new Map();
    protected planner: Planner | null;

    constructor(params: AgentConstructorParams, planner?: Planner) {
        super(params);
        this.planner = planner || new MultiStepPlanner(
            params.llmService,
            params.taskManager,
            params.userId,
            this.modelHelpers,
            this.stepExecutors,
            this.agents
        );
    }

    protected getExecutorParams() {
        // Create standardized params
        const executorParams = {
            llmService: this.llmService,
            taskManager: this.projects,
            artifactManager: this.artifactManager,
            vectorDBService: this.vectorDBService,
            userId: this.userId,
            chatClient: this.chatClient,
            vectorDB: this.vectorDBService,
            modelHelpers: new ModelHelpers({
                llmService: this.llmService,
                userId: this.userId,
                messagingHandle: this.messagingHandle,
                purpose: this.modelHelpers.getPurpose(),
                finalInstructions: this.modelHelpers.getFinalInstructions(),
                sequences: this.modelHelpers.getStepSequences()
            }),
            settings: this.settings
        };
        executorParams.modelHelpers.setPurpose(this.modelHelpers.getPurpose())
        return executorParams;
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
                const module = executorContext(`./${executorConfig.className}.ts`);
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

    static getRootTask(taskId: UUID, projects: TaskManager, depth? : number): Task | null {
        // handle weird issues
        if (depth == 10) {
            Logger.error(`Recursive getRootTask call with ${taskId}.`);
            return null;
        }

        const task = projects.getTaskById(taskId);
        if (!task) return null;
   
        const project = projects.getProject(task.projectId);
        if (!project.metadata.parentTaskId) {
            return task; // This is the root task
        }
   
        // Recursively find the root task
        return StepBasedAgent.getRootTask(project.metadata.parentTaskId, projects, (depth||0)+1);
    }
   
    protected async taskNotification(task: Task, eventType: TaskEventType): Promise<void> {
        const isMine = task.assignee === this.userId;

        // Check for any outstanding async executor steps
        const project = this.projects.getProject(task.projectId);
        const asyncSteps = Object.values(project.tasks).filter(t => 
            t.type === TaskType.Step && 
            (t as StepTask<StepResponse>).props?.result?.async &&
            t.status === TaskStatus.InProgress
        );

        // Notify all async steps about this task update
        for (const asyncStep of asyncSteps) {
            const executor = this.stepExecutors.get(asyncStep.props.stepType);
            if (executor && typeof executor.handleTaskNotification === 'function') {
                await executor.handleTaskNotification({
                    task: asyncStep as StepTask<StepResponse>,
                    notification: {
                        task,
                        eventType
                    }
                });
            }
        }

        // jump-start the step execution if an async step finishes
        if (isMine && eventType === TaskEventType.Completed && task.type === TaskType.Step && (task as StepTask<StepResponse>).props?.result?.async) {
            const posts = (task as StepTask<StepResponse>).props?.userPostId ? [await this.chatClient.getPost((task as StepTask<StepResponse>).props?.userPostId!)]: [{
                id: undefined,
                message: `Async task completed ${task.description}`
            }];
    
            const nextStepParams = {
                projectId: task.projectId,
                task: task
            }

            // Handle response to existing project
            const nextTask = this.projects.getNextTask(task.projectId, TaskType.Step);
    
            if (!nextTask) {
                Logger.info("No remaining tasks, planning new steps");
                const plan = await this.planSteps(nextStepParams);
            }

            await this.executeNextStep(nextStepParams);
        } else if (task.creator === this.userId && task.type === TaskType.Standard) {
            const parentTask = StepBasedAgent.getRootTask(task.id, this.projects);

            if (parentTask && parentTask.creator === this.userId && parentTask.type === TaskType.Step) {
                const postId = (parentTask as StepTask<StepResponse>).props.userPostId;
                const post = postId && await this.chatClient.getPost(postId);
                const posts : ChatPost[]|undefined = post && await this.chatClient.getThreadChain(post);
                if (posts) {
                    const partial = posts.find(p => p.props?.partial);
                    if (partial) this.chatClient.updatePost(partial.id, task.description);
                    else this.reply(post, {message: task.description}, { partial: true });
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
                threadPosts: params.threadPosts
            }
        };
        const plan = await this.planSteps(execParams);
        await this.executeNextStep(execParams);
    }

    protected async handlerThread(params: HandlerParams): Promise<void> {
        const { id: projectId } = params.projects?.filter(p => p.metadata.tags?.includes("agent-internal-steps"))[0] || { id: undefined };

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
                context: {
                    channelId: params.userPost?.channel_id,
                    threadId: params.userPost?.thread_id,
                    projects: params.projects,
                    artifacts: params.artifacts,
                    threadPosts: params.threadPosts
                }
            };
            const plan = await this.planSteps(execParams);
            await this.executeNextStep(execParams);
            return;
        }

        // Handle response to existing project
        const task = this.projects.getNextTask(projectId, TaskType.Step);

        const execParams: ExecuteNextStepParams = {
            projectId,
            userPost: params.userPost,
            context: {
                channelId: params.userPost?.channel_id,
                threadId: params.userPost?.thread_id,
                projects: params.projects,
                artifacts: params.artifacts,
                threadPosts: params.threadPosts
            }
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
        const capabilities : ExecutorCapability[] = [];
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

        if (this.planner === null) {
            const goal = `Perform planning for ${plannerParams.userPost ? `user's goal: ${plannerParams.userPost?.message}` : `task: ${params.task?.description}`}`;
            const newTask: AddTaskParams = {
                type: TaskType.Step,
                description: goal,
                creator: this.userId,
                order: 0, // Add at very beginning
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

        const task = this.projects.getNextTask(projectId, TaskType.Step) as StepTask<StepResponse>;

        if (!task) {
            Logger.warn('No tasks found to execute');
            return;
        }

        this.projects.markTaskInProgress(task);
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
                        artifactIds: [...new Set([...parentTask.props?.result?.artifactIds||[], ...childArtifactIds])],
                        response: {
                            message: combinedResult,
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

            let context : Partial<ExecuteContext>= {};
            let post : Message|undefined = undefined;
            if (task.props?.announceChannelId !== undefined) {
                const handles = await this.chatClient.getHandles();
                const creatorHandle = handles[task.creator];
                const assigneeHandle = task.assignee && handles[task.assignee];

                context.channelId = asUUID(task.props.announceChannelId);
                post = await this.chatClient.postInChannel(context.channelId, 
                    `@user This is a scheduled task reminder for the task ${task.id} created by ${creatorHandle} ${task.description} ${assigneeHandle ? `assigned to ${assigneeHandle}` : ''}}`);
                context.threadId = post.id;
            }

            const parentProject = await this.projects.getProject(task.projectId);

            const artifacts = task.props?.attachedArtifactIds?.length || 0 > 0 ? await this.mapRequestedArtifacts(task.props?.attachedArtifactIds!) : [];

            const execParams: ExecuteNextStepParams = {
                projectId,
                userPost: post,
                context: {
                    ...context,
                    projects: [parentProject],
                    artifacts,
                }
            };

            const plan = await this.planSteps(execParams);

            await this.executeNextStep(execParams);

            // Update parent project with child project reference
            if (parentProject.metadata.childProjects) {
                parentProject.metadata.childProjects.push(projectId);
            } else {
                parentProject.metadata.childProjects = [projectId];
            }
            await this.projects.replaceProject(parentProject);

        } catch (error) {
            Logger.error(`Error processing task ${task.id}`, error);
            // You might want to mark the task as failed or handle the error differently
        }
    }

    private getPartialPost(replyTo: ChatPost | undefined, params: ExecuteNextStepParams) {
        const partialResponse = async (message) => {
            if (replyTo) {
                if (!params.partialPost) {
                    params.partialPost = await this.reply(replyTo, {
                        message
                    }, {
                        partial: true,
                        "project-ids": [params.projectId]
                    });
                } else {
                    params.partialPost = await this.chatClient.updatePost(params.partialPost.id, message);
                }
            }
        };
        return partialResponse;
    }

    protected async executeStep(params: ExecuteStepParams<StepResponse>): Promise<void> {
        const { projectId, task, userPost, context } = params;
        try {
            const executor = this.stepExecutors.get(task.props.stepType);
            if (!executor) {
                throw new Error(`No executor found for step type: ${task.props.stepType}`);
            }

            Logger.info(`Executing step "${task.props.stepType}" for project "${projectId}"`);

            const project = this.projects.getProject(projectId);
            if (!project) {
                throw new Error(`Project ${projectId} not found`);
            }

            // get overall goals
            let channelGoals: Task[] = [];
            let agentsOptions: Agent[] = [];
            if (context?.channelId) {
                const channelData = await this.chatClient.getChannelData(context?.channelId);
                const channelProject = channelData?.projectId
                    ? this.projects.getProject(channelData.projectId)
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
                    });
            } else {
                agentsOptions = Object.values(this.settings.agents).filter(a => a.userId).map(id => {
                    return this.agents.agents[id.userId];
                });
            }

            const self = Object.values(this.agents.agents).find(a => a.userId === this.userId);

            // Get all prior completed tasks' results
            const tasks = this.projects.getProjectTasks(projectId);
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

            const agents = Object.values(this.settings.agents).filter(a => a.handle).map(a => ({
                id: a.userId,
                handle: a.handle!,
                type: ""
            }));


            let replyTo: ChatPost | undefined;
            if (userPost && isValidChatPost(userPost)) {
                replyTo = userPost;
            } else if (project.metadata.originalPostId) {
                replyTo = await this.chatClient.getPost(project.metadata.originalPostId);
            }

            let stepResult: StepResult<StepResponse>;

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
                    partialResponse: this.getPartialPost(replyTo, params)
                });
            } else {
                stepResult = await executor.executeOld(
                    `[Step: ${task.description}] [Project: ${project.name}] ${userPost?.message}`,
                    task.props.stepType,
                    projectId,
                    priorResults
                );
            }

            // step wants to revise overall goal
            if (stepResult.goal) {
                project.name = stepResult.goal;
            }

            if (stepResult.response.status) {
                const partialPostFn = this.getPartialPost(replyTo, params);
                await partialPostFn(stepResult.response.status);
            }

            // check to see if user cancelled steps (run-away?)
            const checkTask = await this.projects.getTaskById(task.id);
            if (!checkTask || checkTask?.status === TaskStatus.Cancelled) {
                Logger.info("Step task was cancelled, aborting process");
                return;
            }

            // Store the result in task props
            await this.projects.updateTask(task.id, {
                props: {
                    ...(projectId && {
                        ...task.props,
                        childProjectId: stepResult.projectId
                    }) ?? task.props,
                    result: stepResult,
                    awaitingResponse: stepResult.needsUserInput,
                    userPostId: userPost?.id,
                    partialPostId: params.partialPost?.id
                }
            } as Partial<StepTask<StepResponse>>);

            // If this was a validation step, check if we need more work
            if (task.props.stepType === 'validation') {
                if (!stepResult.isComplete && stepResult.missingAspects?.length > 0) {
                    // Plan additional steps only if validation failed
                    const planningPrompt = `Original Goal: ${project.name}\n\n` +
                        `The solution is not yet complete. Please continue working on the goal.\n` +
                        `Missing aspects to address:\n` +
                        `${stepResult.missingAspects.map((aspect: string) => `- ${aspect}`).join('\n')}`;

                    //TODO: hacky, we don't really post this message
                    await this.planSteps(params);
                }
            }

            if (stepResult.projectId) {
                const newProject = this.projects.getProject(stepResult.projectId);
                newProject.metadata.parentTaskId = task.id;
                //TODO need a way to update project to disk
            }

            // check if they provided artifact objects for us to save
            const artifactIds = stepResult.artifacts && (await Promise.all<Artifact>(stepResult.artifacts?.map(a => this.artifactManager.saveArtifact(a)))).map(a => a.id);

            const artifactList = [...artifactIds||[], ...stepResult.artifactIds || [], ...stepResult.response?.artifactIds || [], stepResult.response?.data?.artifactId];

            // Only send replies if we have a userPost to reply to
            if (replyTo && stepResult.response.message) {
                const messageResponse = {
                    message: stepResult.response?.message
                }
                const props = {
                    "project-ids": [stepResult.projectId, projectId],
                    artifactIds: artifactList
                };
                if (params.partialPost) {
                    await this.chatClient.updatePost(
                        (params.partialPost as ChatPost).id, 
                        messageResponse.message, 
                        {
                            ...props, 
                            partial: false
                        });
                    params.partialPost = undefined;
                } else {
                    await this.reply(replyTo, messageResponse, props);
                }
            }
            if (stepResult.finished || this.planner?.alwaysComplete) {
                this.projects.completeTask(task.id);
                Logger.info(`Completed step "${task.props.stepType}" for project "${projectId}"`);

                // If this was the last planned task, add a validation step
                const remainingTasks = this.projects.getProjectTasks(projectId).filter(t => !t.complete && t.type === "step");
                if ((stepResult.replan === ReplanType.Allow && remainingTasks.length === 0) || stepResult.replan === ReplanType.Force) {
                    //TODO: hacky, we don't really post this message
                    if (!this.planner || this.planner.allowReplan) {
                        await this.planSteps(params);
                    }
                }

                if (!stepResult.needsUserInput) {
                    const stepArtifacts = await this.mapRequestedArtifacts(artifactList);
                    const fullArtifactList = ArrayUtils.deduplicateById([...stepArtifacts, ...params.context?.artifacts || []]);

                    await this.executeNextStep({
                        projectId,
                        userPost,
                        context: {
                            ...params.context,
                            artifacts: fullArtifactList
                        },
                        partialPost: params.partialPost
                    });
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
}
