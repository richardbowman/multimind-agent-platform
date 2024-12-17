import { StepExecutor, StepResult } from '../stepBasedAgent';
import { StructuredOutputPrompt } from "src/llm/ILLMService";
import { ModelHelpers } from '../../llm/modelHelpers';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { ILLMService } from '../../llm/ILLMService';
import { TaskManager, RecurrencePattern } from '../../tools/taskManager';
import { Task } from '../../tools/taskManager';
import { randomUUID } from 'crypto';
import Logger from '../../helpers/logger';

@StepExecutorDecorator('schedule_task', 'Schedule a recurring task')
export class ScheduleTaskExecutor implements StepExecutor {
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
                    taskDescription: { type: 'string' },
                    recurrencePattern: { type: 'string', enum: ['Daily', 'Weekly', 'Monthly'] },
                    responseMessage: { type: 'string' }
                }
            },
            `Create a new recurring task based on this goal.
            Specify:
            1. A clear task description
            2. How often it should recur (Daily, Weekly, or Monthly)
            3. A user-friendly confirmation message`
        );

        try {
            const responseJSON = await this.modelHelpers.generate({
                message: goal,
                instructions: structuredPrompt
            });

            const { taskDescription, recurrencePattern, responseMessage } = responseJSON;

            const taskId = randomUUID();

            // Map string pattern to enum
            const pattern = {
                'Daily': RecurrencePattern.Daily,
                'Weekly': RecurrencePattern.Weekly,
                'Monthly': RecurrencePattern.Monthly
            }[recurrencePattern];

            const task: Task = {
                id: taskId,
                description: taskDescription,
                creator: 'system',
                projectId: projectId,
                isRecurring: true,
                recurrencePattern: pattern,
                lastRunDate: new Date(),
                complete: false
            };

            // Add task to project
            await this.taskManager.addTask(projectId, task);

            return {
                type: "schedule_task",
                finished: true,
                response: {
                    message: responseMessage
                }
            };

        } catch (error) {
            Logger.error('Error in ScheduleTaskExecutor:', error);
            return {
                type: "schedule_task",
                finished: true,
                response: {
                    message: 'Failed to schedule the recurring task. Please try again later.'
                }
            };
        }
    }
}
