import { Agent, PlannerParams, TaskEventType } from './agents';
import { getExecutorMetadata } from './decorators/executorDecorator';
import 'reflect-metadata';
import { ChatPost, isValidChatPost, Message } from '../chat/chatClient';
import { HandleActivity, HandlerParams, ResponseType } from './agents';
import { AgentConstructorParams } from './interfaces/AgentConstructorParams';
import { AddTaskParams, Project, Task, TaskStatus, TaskType } from '../tools/taskManager';
import { Planner } from './planners/planner';
import { MultiStepPlanner } from './planners/multiStepPlanner';
import Logger from '../helpers/logger';
import { PlanStepsResponse } from '../schemas/PlanStepsResponse';
import { InMemoryPost } from 'src/chat/localChatClient';
import { AgentConfig } from 'src/tools/settings';
import { ReplanType, StepResult } from './interfaces/StepResult';
import { StepExecutor } from './interfaces/StepExecutor';
import { ExecuteNextStepParams } from './interfaces/ExecuteNextStepParams';
import { ExecuteStepParams, StepTask } from './interfaces/ExecuteStepParams';
import { pathExists } from 'fs-extra';
import { ModelHelpers } from 'src/llm/modelHelpers';
import { ExecutorType } from './interfaces/ExecutorType';
import { exec } from 'child_process';

interface ExecutorCapability {
    stepType: string;
    description: string;
    exampleInput?: string;
    exampleOutput?: string;
}

export abstract class StepBasedAgent extends Agent {
    protected stepExecutors: Map<string, StepExecutor> = new Map();
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

    protected async taskNotification(task: Task, eventType: TaskEventType): Promise<void> {
        const isMine = task.assignee === this.userId;

        // jump-start the step execution if an async step finishes
        if (isMine && eventType === TaskEventType.Completed && task.type === TaskType.Step && (task as StepTask).props?.result?.async) {
            const posts = (task as StepTask).props?.userPostId ? [await this.chatClient.getPost((task as StepTask).props?.userPostId!)]: [{
                id: undefined,
                message: `Async task completed ${task.description}`
            }];
    
            const nextStepParams = {
                projectId: task.projectId
            }

            // Handle response to existing project
            const nextTask = this.projects.getNextTask(task.projectId, TaskType.Step);
    
            if (!nextTask) {
                Logger.info("No remaining tasks, planning new steps");
                const plan = await this.planSteps(task.projectId, posts, this.getPartialPost(posts[0].id && posts[0], nextStepParams));
            }

            await this.executeNextStep(nextStepParams);
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
        const plan = await this.planSteps(projectId, posts, this.getPartialPost(params.userPost, execParams));
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
            const plan = await this.planSteps(projectId,
                [params.rootPost || { message: "(missing root post)" }, ...params.threadPosts || [], params.userPost],
                this.getPartialPost(params.rootPost, execParams)
            );
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
            const plan = await this.planSteps(projectId,
                [params.rootPost || { message: "(missing root post)" }, ...params.threadPosts || [],
                params.userPost],
                this.getPartialPost(params.rootPost, execParams));
        }

        // Continue with existing tasks without replanning
        await this.executeNextStep(execParams);
    }

    protected registerStepExecutor(executor: StepExecutor): void {
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

    protected async planSteps(projectId: string, posts: Message[], partialPostFn: Function): Promise<PlanStepsResponse> {
        const project = await this.projects.getProject(projectId);
        const handlerParams: PlannerParams = {
            projects: [project],
            threadPosts: posts?.slice(0, -1),
            userPost: posts?.[posts?.length - 1]
        };

        if (this.planner === null) {
            const goal = `Perform planning for user's goal: ${handlerParams.userPost.message}`;
            const newTask: AddTaskParams = {
                type: TaskType.Step,
                description: goal,
                creator: this.userId,
                order: 0, // Add to end of current tasks
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

            const steps = await this.planner.planSteps(handlerParams);

            // Send a progress message about the next steps
            const nextStepsMessage = steps.steps ?
                steps.steps.map((step, index) => `${index + 1}. ${step.actionType}`)
                    .join('\n') : "No steps provided";

            await partialPostFn(`🔄 Planning next steps:\n${nextStepsMessage}`);
            return steps;
        }
    }

    protected async executeNextStep(params: ExecuteNextStepParams): Promise<void> {
        const { projectId } = params;

        const task = this.projects.getNextTask(projectId, TaskType.Step) as StepTask;

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
                .map(t => t.props?.result?.response)
                .filter(r => r);

            // Combine all results into one
            const combinedResult = completedResults
                .map(r => r.message || r.reasoning || '')
                .filter(msg => msg)
                .join('\n\n');

            await this.projects.updateTask(parentTask.id, {
                props: {
                    ...parentTask.props,
                    result: {
                        ...parentTask.props?.result,
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

            const parentProject = await this.projects.getProject(task.projectId);

            const artifacts = task.props?.attachedArtifactIds?.length || 0 > 0 ? await this.mapRequestedArtifacts(task.props?.attachedArtifactIds!) : [];

            const execParams: ExecuteNextStepParams = {
                projectId,
                context: {
                    projects: [parentProject],
                    artifacts
                }
            };

            const plan = await this.planSteps(projectId, [{
                message: task.description
            }],
                this.getPartialPost(undefined, execParams)
            );

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
                        message,
                        props: {
                            partial: true
                        }
                    });
                } else {
                    params.partialPost = await this.chatClient.updatePost(params.partialPost.id, message);
                }
            }
        };
        return partialResponse;
    }

    protected async executeStep(params: ExecuteStepParams): Promise<void> {
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

            // Get all prior completed tasks' results
            const tasks = this.projects.getAllTasks(projectId);
            const priorSteps = tasks
                .filter(t => t.type === "step")
                .map(t => t as StepTask)
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

            let stepResult: StepResult;

            if (executor.execute) {
                stepResult = await executor.execute({
                    agentId: this.userId,
                    goal: `[Step: ${task.description}] [Project: ${project.name}] Solve the user's request: ${userPost?.message}`,
                    step: task.props.stepType,
                    stepId: task.id,
                    channelGoals,
                    projectId: projectId,
                    previousResult: priorResults,
                    steps: priorSteps,
                    message: userPost?.message,
                    stepGoal: task.description,
                    overallGoal: project.name,
                    executionMode: userPost ? 'conversation' : 'task',
                    agents: agentsOptions,
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
                    ...task.props,
                    result: stepResult,
                    awaitingResponse: stepResult.needsUserInput,
                    userPostId: userPost?.id
                }
            } as Partial<StepTask>);

            // If this was a validation step, check if we need more work
            if (task.props.stepType === 'validation') {
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
                    })], this.getPartialPost(replyTo, params));
                }
            }

            if (stepResult.projectId) {
                const newProject = this.projects.getProject(stepResult.projectId);
                newProject.metadata.parentTaskId = task.id;
                //TODO need a way to update project to disk
            }

            const artifactList = [...stepResult.artifactIds || [], ...stepResult.response?.artifactIds || [], stepResult.response?.data?.artifactId];

            // Only send replies if we have a userPost to reply to
            if (replyTo && stepResult.response.message) {
                const messageResponse = {
                    message: stepResult.response?.message
                }
                const props = {
                    "project-ids": [stepResult.projectId, projectId],
                    "artifact-ids": artifactList
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
                const remainingTasks = this.projects.getAllTasks(projectId).filter(t => !t.complete && t.type === "step");
                if ((stepResult.replan === ReplanType.Allow && remainingTasks.length === 0) || stepResult.replan === ReplanType.Force) {
                    //TODO: hacky, we don't really post this message
                    if (!this.planner || this.planner.allowReplan) {
                        await this.planSteps(project.id, [InMemoryPost.fromLoad({
                            ...userPost,
                            message: `Replanning requested after ${stepResult.type} step completed`
                        })], this.getPartialPost(replyTo, params));
                    }
                }

                if (!stepResult.needsUserInput) {
                    const stepArtifacts = await this.mapRequestedArtifacts(artifactList);
                    const fullArtifactList = [...stepArtifacts, ...params.context?.artifacts || []];


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
