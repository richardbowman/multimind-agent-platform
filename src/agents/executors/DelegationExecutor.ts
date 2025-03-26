import { ExecutorConstructorParams } from '../interfaces/ExecutorConstructorParams';
import { BaseStepExecutor, TaskNotification } from '../interfaces/StepExecutor';
import { ExecuteParams } from '../interfaces/ExecuteParams';
import { ReplanType, StepResponse, StepResult, StepResultType } from '../interfaces/StepResult';
import { ModelHelpers } from '../../llm/modelHelpers';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { Project, Task, TaskManager, TaskType } from '../../tools/taskManager';
import Logger from '../../helpers/logger';
import { createUUID, UUID } from 'src/types/uuid';
import { ContentType, OutputType } from 'src/llm/promptBuilder';
import { ExecutorType } from '../interfaces/ExecutorType';
import { DelegationResponse as DelegationResponse, DelegationSchema } from 'src/schemas/DelegationSchema';
import { StringUtils } from 'src/utils/StringUtils';
import { TaskStatus } from 'src/schemas/TaskStatus';
import { StepTask } from '../interfaces/ExecuteStepParams';
import { ArtifactType, DocumentSubtype } from 'src/tools/artifact';
import { withRetry } from 'src/helpers/retry';

@StepExecutorDecorator(ExecutorType.DELEGATION, 'Delegate task(s) to agent(s) in the channel')
export class DelegationExecutor extends BaseStepExecutor<StepResponse> {
    private modelHelpers: ModelHelpers;
    private taskManager: TaskManager;

    constructor(params: ExecutorConstructorParams) {
        super(params);
        this.modelHelpers = params.modelHelpers;
        this.taskManager = params.taskManager!;
    }

    async handleTaskNotification(notification: TaskNotification): Promise<void> {
        const { task, childTask } = notification;
        if (childTask.status === TaskStatus.Completed && task.type === TaskType.Step) {
            const project = await this.params.taskManager.getProject(childTask.projectId);
            const taskIds = Object.keys(project.tasks) as UUID[];
            const currentIndex = taskIds.indexOf(childTask.id);

            if (currentIndex === -1) throw new Error("Invalid task list");

            if (currentIndex < taskIds.length - 1) {
                const nextTaskId = taskIds[currentIndex + 1];
                const nextTask = project.tasks[nextTaskId];

                // Transfer artifacts
                if (childTask.props?.result?.artifactIds?.length) {
                    await this.taskManager.updateTask(nextTaskId, {
                        props: {
                            ...nextTask.props,
                            attachedArtifactIds: [
                                ...new Set([...(nextTask.props?.artifactIds || []),
                                ...childTask.props.result.artifactIds])
                            ],
                            priorStepStatus: childTask.props?.result?.response?.message||childTask.props?.result?.response?.status
                        }
                    });
                }
            }
        }
    }

    async onChildProjectComplete(stepTask: StepTask<StepResponse>, project: Project): Promise<StepResult<StepResponse>> {
        // Check if all delegated tasks are complete
        const completedTasks = Object.values(project.tasks).filter(t => t.status === TaskStatus.Completed);
        const totalTasks = Object.keys(project.tasks).length;

        if (completedTasks.length < totalTasks) {
            return {
                finished: false,
                async: true,
                projectId: project.id,
                response: {
                    status: `Delegation progress: ${completedTasks.length}/${totalTasks} tasks completed`
                }
            };
        }

        // Generate a summary of the completed delegation
        const prompt = this.modelHelpers.createPrompt();
        prompt.addInstruction(`Summarize the results of the completed delegation in a thorough status message for the agent that explains the tasks completed and the results.`);

        prompt.addContext({
            contentType: ContentType.TASKS,
            tasks: completedTasks
        });

        const rawResponse = await this.modelHelpers.generateMessage({
            message: `Delegation results: ${JSON.stringify(completedTasks, null, 2)}`,
            instructions: prompt
        });

        const artifactIds = completedTasks.map(t => t.props?.result?.artifactIds).flat().filter(a => !!a);

        return {
            finished: true,
            replan: ReplanType.Allow,
            artifactIds,
            async: false,
            response: {
                status: rawResponse.message
            }
        };
    }

    

    async execute(params: ExecuteParams): Promise<StepResult<StepResponse>> {
        const supportedAgents = params.agents?.filter(a => a?.supportsDelegation);
        if (supportedAgents?.length === 0) {
            throw new Error("No agents with delegation enabled in channel.");
        }

        // Search for delegation-specific procedure guides
        const delegationGuides = await this.params.artifactManager.searchArtifacts(
            StringUtils.truncateWithEllipsis(params.stepGoal, 1000),
            {
                type: ArtifactType.Document,
                subtype: DocumentSubtype.Procedure,
                tags: ['delegation']
            },
            3 // Limit to top 3 most relevant
        );

        const prompt = this.startModel(params);
        prompt.addContext({contentType: ContentType.GOALS_FULL, params});
        const schema = await DelegationSchema;
        
        // Add delegation guides context if found
        if (delegationGuides.length > 0) {
            const loadedGuides = await this.params.artifactManager.bulkLoadArtifacts(
                delegationGuides.map(g => g.artifact.id)
            );
            prompt.addContext({
                contentType: ContentType.PROCEDURE_GUIDES,
                guideType: "delegation",
                guides: loadedGuides
            });
        }

        prompt.addInstruction( `Create a project with tasks that should be delegated to all agents in the channel. 
            For each task, specify which agent should handle it based on their capabilities.
            Output should include:
            - A clear project name and goal
            - A list of tasks with descriptions and assigned agents
            - A response message to explain the delegation plan to the user.
            - Create as few delegation steps as possible to achieve the goal.
            - If you delegate to managers, don't also delegate to their team.`);

        supportedAgents && prompt.addContext({contentType: ContentType.AGENT_OVERVIEWS, agents: supportedAgents});
        prompt.addInstruction( `IMPORTANT DELEGATION RULES:
            - Create THE FEWEST delegation steps as possible to achieve the goal.
            - If you delegate to managers, do not also delegate to their team. (i.e. don't delegate to the research manager AND the research assistant)
            - Instead of making multiple tasks for the same agent, combine them into one complete task.
            - MAKE SURE THE TASK DESCRIPTION is completely stand-alone and contains ALL details provided.
            - Review any available delegation procedure guides for best practices on task delegation and assignment.
            - The agent will not receive any other information except for what is in the task description so the task description
            should not refer back to the message or goals, it should be self-contained. For instance, if the goal contains an artifact name or URL, make sure to restate it.`);
        prompt.addOutputInstructions({outputType: OutputType.JSON_WITH_MESSAGE_AND_REASONING, schema});

        try {
            const { projectName, projectGoal, tasks, responseMessage } = await withRetry(async () => {
                const rawResponse = await prompt.generate({
                    message: params.stepGoal
                });
                const response = StringUtils.extractAndParseJsonBlock<DelegationResponse>(rawResponse, schema);
                return response;
            }, (r) => r.projectGoal.length > 0 && r.tasks.length > 0, { maxRetries: 2, timeoutMs: 180000} );


            // Create the project
            const project = await this.taskManager.createProject({
                name: projectName,
                metadata: {
                    description: projectGoal,
                    status: 'active',
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    parentTaskId: params.stepId
                }
            });

            // Create tasks and assign to agents
            const taskDetails : string[] = [];
            for (const task of tasks) {
                const { id: taskId} = await this.taskManager.addTask(project, {
                    description: task.description,
                    creator: params.agentId,
                    type: TaskType.Standard,
                    props: {
                        goal: projectGoal,
                        attachedArtifactIds: params.context?.artifacts?.map(a => a.id) || []
                    }
                });

                // Find and assign to agent
                const agent = params.agents?.find(a => a.messagingHandle === task.assignee);
                if (agent) {
                    await this.taskManager.assignTaskToAgent(taskId, agent.userId);
                } else {
                    Logger.error(`Unable to delegate to unknown (or unsupported for delegation) agent ${task.assignee}`)
                }

                taskDetails.push(`${task.description} [${taskId}] -> ${task.assignee}`);
            }

            return {
                type: StepResultType.Delegation,
                projectId: project.id,
                finished: false,
                async: true,
                response: {
                    status: responseMessage,
                    data: {
                        projectName,
                        projectId: project.id
                    }
                }
            };

        } catch (error) {
            Logger.error('Error in DelegationExecutor:', error);
            return {
                type: StepResultType.Delegation,
                finished: true,
                response: {
                    status: 'Failed to create the delegated project. Please try again later.'
                }
            };
        }
    }
}
