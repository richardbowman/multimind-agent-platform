import { ExecutorConstructorParams } from '../interfaces/ExecutorConstructorParams';
import { StepExecutor } from '../interfaces/StepExecutor';
import { ExecuteParams } from '../interfaces/ExecuteParams';
import { StepResponse, StepResult, StepResultType } from '../interfaces/StepResult';
import { StructuredOutputPrompt } from "../../llm/ILLMService";
import { ModelHelpers } from '../../llm/modelHelpers';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { Task, TaskManager, TaskType } from '../../tools/taskManager';
import Logger from '../../helpers/logger';
import { createUUID } from 'src/types/uuid';
import { Agent } from '../agents';
import { ContentType } from 'src/llm/promptBuilder';

@StepExecutorDecorator('delegation', 'Create projects with tasks delegated to agents in the channel')
export class DelegationExecutor implements StepExecutor<StepResponse> {
    private modelHelpers: ModelHelpers;
    private taskManager: TaskManager;

    constructor(params: ExecutorConstructorParams) {
        this.modelHelpers = params.modelHelpers;
        this.taskManager = params.taskManager!;
    }

    async execute(params: ExecuteParams): Promise<StepResult<StepResponse>> {
        const schema = {
            type: 'object',
            properties: {
                projectName: { type: 'string' },
                projectGoal: { type: 'string' },
                tasks: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            description: { type: 'string' },
                            assignee: { type: 'string' } // Agent handle
                        }
                    }
                },
                responseMessage: { type: 'string' }
            }
        };
        
        const supportedAgents = params.agents?.filter(a => a?.supportsDelegation);
        if (supportedAgents?.length === 0) {
            throw new Error("No agents with delegation enabled in channel.");
        }

        const prompt = this.modelHelpers.createPrompt();
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
            - The agent will not receive any other information except for what is in the task description so the task description
            should not refer back to the message or goals, it should be self-contained. For instance, if the goal contains an artifact name or URL, make sure to restate it.`);

        const structuredPrompt = new StructuredOutputPrompt(
            schema,
           prompt.build()
        );

        try {
            const responseJSON = await this.modelHelpers.generate({
                message: params.stepGoal,
                instructions: structuredPrompt
            });

            const { projectName, projectGoal, tasks, responseMessage } = responseJSON;

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
                    message: `${responseMessage}\n\nProject "${projectName}" created with ID: ${project.id}\n\nTasks:\n` +
                        taskDetails.join('\n')
                }
            };

        } catch (error) {
            Logger.error('Error in DelegationExecutor:', error);
            return {
                type: StepResultType.Delegation,
                finished: true,
                response: {
                    message: 'Failed to create the delegated project. Please try again later.'
                }
            };
        }
    }
}
