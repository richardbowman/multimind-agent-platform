import { StepExecutor, StepResult } from '../stepBasedAgent';
import { StructuredOutputPrompt } from "src/llm/ILLMService";
import { ModelHelpers } from '../../llm/modelHelpers';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { ILLMService } from '../../llm/ILLMService';
import { TaskManager } from '../../tools/taskManager';
import { Task } from '../../tools/taskManager';
import { randomUUID } from 'crypto';
import { CONTENT_MANAGER_USER_ID, RESEARCH_MANAGER_USER_ID } from '../../helpers/config';
import Logger from '../../helpers/logger';

@StepExecutorDecorator('complex_project', 'Kickoff a combined project involving both research and content development')
export class ComplexProjectExecutor implements StepExecutor {
    private modelHelpers: ModelHelpers;

    constructor(
        private llmService: ILLMService,
        private taskManager: TaskManager
    ) {
        this.modelHelpers = new ModelHelpers(llmService, 'executor');
    }

    async executeOld(goal: string, step: string, projectId: string): Promise<StepResult> {
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
                message: goal,
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
                projectId: projectId,
                type: ResearchActivityType.WebResearch,
                complete: false
            };

            // Create content task that depends on research completion
            const contentTaskId = randomUUID();
            tasks[contentTaskId] = {
                id: contentTaskId,
                description: `${contentTask} [${projectGoal}]`,
                creator: 'system',
                projectId: projectId,
                type: "create-full-content",
                complete: false,
                dependsOn: researchTaskId
            };

            // Assign tasks to agents
            this.taskManager.assignTaskToAgent(researchTaskId, RESEARCH_MANAGER_USER_ID);
            this.taskManager.assignTaskToAgent(contentTaskId, CONTENT_MANAGER_USER_ID);

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
