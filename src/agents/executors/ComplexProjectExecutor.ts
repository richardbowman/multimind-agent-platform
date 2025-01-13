import { ExecuteParams, ExecutorConstructorParams, StepExecutor, StepResult } from '../stepBasedAgent';
import { StructuredOutputPrompt } from "src/llm/ILLMService";
import { ModelHelpers } from '../../llm/modelHelpers';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { TaskManager } from '../../tools/taskManager';
import { Task } from '../../tools/taskManager';
import { randomUUID } from 'crypto';
import Logger from '../../helpers/logger';

@StepExecutorDecorator('complex_project', 'Kickoff a combined project involving both research and content development')
export class ComplexProjectExecutor implements StepExecutor {
    private modelHelpers: ModelHelpers;
    private taskManager: TaskManager;

    constructor(params: ExecutorConstructorParams) {
        this.modelHelpers = new ModelHelpers(params.llmService, 'executor');
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

            // Create tasks
            const tasks: Record<string, Task> = {};
            
            // Create research task first
            const researchTaskId = randomUUID();
            tasks[researchTaskId] = {
                id: researchTaskId,
                description: `${researchTask} [${projectGoal}]`,
                creator: 'system',
                projectId: params.projectId,
                type: "web-research",
                complete: false
            };

            // Create content task that depends on research completion
            const contentTaskId = randomUUID();
            tasks[contentTaskId] = {
                id: contentTaskId,
                description: `${contentTask} [${projectGoal}]`,
                creator: 'system',
                projectId: params.projectId,
                type: "create-full-content",
                complete: false,
                dependsOn: researchTaskId
            };

            // Assign tasks to appropriate agents
            const researchManager = params.agents?.find(a => a.handle === '@research');
            const contentManager = params.agents?.find(a => a.handle === '@content');
            
            if (researchManager) {
                this.taskManager.assignTaskToAgent(researchTaskId, researchManager.id);
            } else {
                Logger.warn('No research manager agent found');
            }
            
            if (contentManager) {
                this.taskManager.assignTaskToAgent(contentTaskId, contentManager.id);
            } else {
                Logger.warn('No content manager agent found');
            }

            return {
                type: "complex_project",
                finished: true,
                response: {
                    message: responseMessage
                }
            };

        } catch (error) {
            Logger.error('Error in ComplexProjectExecutor:', error);
            return {
                type: "complex_project",
                finished: true,
                response: {
                    message: 'Failed to create the complex project. Please try again later.'
                }
            };
        }
    }
}
