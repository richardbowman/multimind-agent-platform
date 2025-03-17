import { ExecutorConstructorParams } from '../interfaces/ExecutorConstructorParams';
import { BaseStepExecutor } from '../interfaces/StepExecutor';
import { ExecuteParams } from '../interfaces/ExecuteParams';
import { StepResponse, StepResult, StepResultType } from '../interfaces/StepResult';
import { ModelHelpers } from '../../llm/modelHelpers';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { Project, TaskManager, TaskType } from '../../tools/taskManager';
import Logger from '../../helpers/logger';
import { createUUID } from 'src/types/uuid';
import { ContentType, OutputType } from 'src/llm/promptBuilder';
import { ExecutorType } from '../interfaces/ExecutorType';
import { DelegationResponse as DelegationResponse, DelegationSchema } from 'src/schemas/DelegationSchema';
import { StringUtils } from 'src/utils/StringUtils';
import { TaskStatus } from 'src/schemas/TaskStatus';
import { StepTask } from '../interfaces/ExecuteStepParams';

@StepExecutorDecorator(ExecutorType.DELEGATION, 'Create projects with tasks delegated to agents in the channel')
export class DelegationExecutor extends BaseStepExecutor<StepResponse> {
    private modelHelpers: ModelHelpers;
    private taskManager: TaskManager;

    constructor(params: ExecutorConstructorParams) {
        super(params);
        this.modelHelpers = params.modelHelpers;
        this.taskManager = params.taskManager!;
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
        prompt.addInstruction(`Summarize the results of the completed delegation in a concise status message for the agent. 
            Include statistics about the results (tasks completed, success rate, etc).`);

        prompt.addContext({
            contentType: ContentType.TASKS,
            tasks: completedTasks
        });

        const rawResponse = await this.modelHelpers.generateMessage({
            message: `Delegation results: ${JSON.stringify(completedTasks, null, 2)}`,
            instructions: prompt
        });

        return {
            finished: true,
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
        const delegationGuides = await this.artifactManager.searchArtifacts(
            params.stepGoal,
            {
                type: ArtifactType.Document,
                subtype: DocumentSubtype.Procedure,
                tags: ['delegation']
            },
            3 // Limit to top 3 most relevant
        );

        const prompt = this.startModel(params);
        const schema = await DelegationSchema;
        
        // Add delegation guides context if found
        if (delegationGuides.length > 0) {
            const loadedGuides = await this.artifactManager.bulkLoadArtifacts(
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
            const rawResponse = await prompt.generate({
                message: params.stepGoal
            });

            const json = StringUtils.extractAndParseJsonBlock<DelegationResponse>(rawResponse, schema);
            const { projectName, projectGoal, tasks, responseMessage }: DelegationResponse = json;

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
                const taskId = createUUID();
                await this.taskManager.addTask(project, {
                    id: taskId,
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
                    status: `${responseMessage}\n\nProject "${projectName}" created with ID: ${project.id}\n\nTasks:\n` +
                        taskDetails.join('\n')
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
