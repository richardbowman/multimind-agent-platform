import { ExecutorConstructorParams } from '../interfaces/ExecutorConstructorParams';
import { StepExecutor } from '../interfaces/StepExecutor';
import { ExecuteParams } from '../interfaces/ExecuteParams';
import { StepResult, StepResultType } from '../interfaces/StepResult';
import { StructuredOutputPrompt } from "../../llm/ILLMService";
import { ModelHelpers } from '../../llm/modelHelpers';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { TaskManager, TaskType } from '../../tools/taskManager';
import Logger from '../../helpers/logger';
import { createUUID } from 'src/types/uuid';

@StepExecutorDecorator('complex_project', 'Kickoff a combined project involving both research and content development')
export class ComplexProjectExecutor implements StepExecutor {
    private modelHelpers: ModelHelpers;
    private taskManager: TaskManager;

    constructor(params: ExecutorConstructorParams) {
        this.modelHelpers = params.modelHelpers;

        this.taskManager = params.taskManager!;
    }

    async execute(params: ExecuteParams): Promise<StepResult> {
        const structuredPrompt = new StructuredOutputPrompt(
            {
                type: 'object',
                properties: {
                    projectName: { type: 'string' },
                    projectGoal: { type: 'string' },
                    researchTask: { type: 'string' },
                    contentTask: { type: 'string' },
                    responseMessage: { type: 'string' }
                }
            },
            `Create a new project with multiple tasks for both research and content teams based on this goal. Make sure the tasks are
            thoroughly described, independent, and complete.`
        );

        try {
            const responseJSON = await this.modelHelpers.generate({
                message: params.message || params.stepGoal,
                instructions: structuredPrompt
            });

            const { projectName, projectGoal, researchTask, contentTask, responseMessage } = responseJSON;

            // Create the project first
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
            const researchManager = params.agents?.find(a => a.handle === '@research');
            const contentManager = params.agents?.find(a => a.handle === '@content');
            
            if (researchManager) {
                await this.taskManager.assignTaskToAgent(researchTaskId, researchManager.id);
            } else {
                Logger.warn('No research manager agent found');
            }
            
            if (contentManager) {
                await this.taskManager.assignTaskToAgent(contentTaskId, contentManager.id);
            } else {
                Logger.warn('No content manager agent found');
            }

            return {
                type: StepResultType.ComplexProjectKickoff,
                projectId: project.id,
                finished: true,
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
