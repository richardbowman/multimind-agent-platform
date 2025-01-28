import { ExecutorConstructorParams } from '../interfaces/ExecutorConstructorParams';
import { StepExecutor } from '../interfaces/StepExecutor';
import { ExecuteParams } from '../interfaces/ExecuteParams';
import { StepResult, StepResultType } from '../interfaces/StepResult';
import { StructuredOutputPrompt } from "../../llm/ILLMService";
import { ModelHelpers } from '../../llm/modelHelpers';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { Task, TaskManager, TaskType } from '../../tools/taskManager';
import Logger from '../../helpers/logger';
import { createUUID } from 'src/types/uuid';
import { TaskCategories } from '../interfaces/taskCategories';

@StepExecutorDecorator('complex_project', 'Kickoff a combined project involving both research and content development')
export class ComplexProjectExecutor implements StepExecutor {
    private modelHelpers: ModelHelpers;
    private taskManager: TaskManager;

    constructor(params: ExecutorConstructorParams) {
        this.modelHelpers = params.modelHelpers;

        this.taskManager = params.taskManager!;
    }

    private formatMessage(goal: string, artifacts?: Artifact[]): string {
        let message = `Project Goal: ${goal}\n\n`;

        // Include relevant artifacts if available
        if (artifacts && artifacts.length > 0) {
            message += "📋 Relevant Artifacts:\n";
            artifacts.forEach((artifact, index) => {
                message += `${index + 1}. ${artifact.type}: ${artifact.content.toString().slice(0, 200)}...\n`;
            });
            message += '\n';
        }

        return message;
    }

    async execute(params: ExecuteParams): Promise<StepResult> {
        //TODO: convert to automated typescript schema
        const schema = {
            type: 'object',
            properties: {
                projectName: { type: 'string' },
                projectGoal: { type: 'string' },
                researchTask: { type: 'string' },
                contentTask: { type: 'string' },
                responseMessage: { type: 'string' },
                dependencies: {
                    type: 'array',
                    items: {
                        type: 'string'
                    }
                },
                risks: {
                    type: 'array',
                    items: {
                        type: 'string'
                    }
                }
            }
        };

        const formattedMessage = this.formatMessage(params.goal, params.context?.artifacts);

        // include capabilities of the agents
        const structuredPrompt = new StructuredOutputPrompt(
            schema,
            `Describe the necessary research and content requirments based on the user's goal. 
            
            Output should include:
            - A clear project name and goal
            - Detailed request for Web-based Research and Content Development tasks
            - A response message to explain the plan to the user`
        );

        try {
            const responseJSON = await this.modelHelpers.generate({
                message: formattedMessage,
                instructions: structuredPrompt
            });

            const { projectName, projectGoal, researchTask, contentTask, responseMessage, dependencies, risks } = responseJSON;

            // Create the project with enhanced metadata
            const project = await this.taskManager.createProject({
                name: projectName,
                metadata: {
                    description: projectGoal,
                    status: 'active',
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    parentTaskId: params.stepId,
                    dependencies: dependencies || [],
                    risks: risks || [],
                    artifacts: params.context?.artifacts?.map(a => a.id) || []
                }
            });

            // Create research task
            const researchTaskId = createUUID();
            await this.taskManager.addTask(project, {
                id: researchTaskId,
                description: researchTask,
                creator: params.agentId,
                type: TaskType.Standard,
                props: {
                    goal: projectGoal
                }
            });

            // Create content task with dependency
            const contentTaskId = createUUID();
            await this.taskManager.addTask(project, {
                id: contentTaskId,
                description: contentTask,
                creator: params.agentId,
                type: TaskType.Standard,
                props: {
                    goal: projectGoal,
                    dependsOn: researchTaskId
                }
            });

            // Assign tasks to appropriate agents
            const researchManager = params.agents?.find(a => a.messagingHandle === '@research');
            const contentManager = params.agents?.find(a => a.messagingHandle === '@content');
            
            if (researchManager) {
                await this.taskManager.assignTaskToAgent(researchTaskId, researchManager.userId);
            } else {
                Logger.warn('No research manager agent found');
            }
            
            if (contentManager) {
                await this.taskManager.assignTaskToAgent(contentTaskId, contentManager.userId);
            } else {
                Logger.warn('No content manager agent found');
            }

            return {
                type: StepResultType.ComplexProjectKickoff,
                projectId: project.id,
                finished: false,
                response: {
                    message: `${responseMessage}\n\nProject "${projectName}" created with ID: ${project.id}\n\nTasks:\n` +
                        `1. Research: ${researchTask} [${researchTaskId}]\n` +
                        `2. Content: ${contentTask} [${contentTaskId}]`
                }
            };

        } catch (error) {
            Logger.error('Error in ComplexProjectExecutor:', error);
            return {
                type: StepResultType.ComplexProjectKickoff,
                finished: true,
                response: {
                    message: 'Failed to create the complex project. Please try again later.'
                }
            };
        }
    }
}
