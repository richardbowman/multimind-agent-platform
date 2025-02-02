import { ExecutorConstructorParams, ExecuteParams } from '../interfaces/ExecutorConstructorParams';
import { StepExecutor } from '../interfaces/StepExecutor';
import { StepResult, ReplanType } from '../interfaces/StepResult';
import { StructuredOutputPrompt } from "src/llm/ILLMService";
import { ModelHelpers } from '../../llm/modelHelpers';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { ILLMService } from '../../llm/ILLMService';
import { TaskManager, RecurrencePattern } from '../../tools/taskManager';
import { Task } from '../../tools/taskManager';
import { randomUUID } from 'crypto';
import Logger from '../../helpers/logger';
import { getGeneratedSchema } from '../../helpers/schemaUtils';
import { SchemaType } from '../../schemas/SchemaTypes';
import { ContentType } from 'src/llm/promptBuilder';
import { TaskCreationResponse } from '../../schemas/taskCreation';

@StepExecutorDecorator('schedule_task', 'Schedule a recurring task')
export class ScheduleTaskExecutor implements StepExecutor {
    private modelHelpers: ModelHelpers;
    taskManager: TaskManager;

    constructor(params: ExecutorConstructorParams) {
        this.modelHelpers = params.modelHelpers;

        this.taskManager = params.taskManager!;
    }

    async execute(params: ExecuteParams): Promise<StepResult> {
        const { goal, step, projectId } = params;
        const schema = await getGeneratedSchema(SchemaType.TaskCreationResponse);
        
        // Create prompt using PromptBuilder
        const promptBuilder = this.modelHelpers.createPrompt();
        
        // Add core instructions
        promptBuilder.addInstruction(this.modelHelpers.getFinalInstructions());
        
        // Add content sections
        promptBuilder.addContext({ contentType: ContentType.OVERALL_GOAL, params: params.overallGoal });
        promptBuilder.addContext({ contentType: ContentType.EXECUTE_PARAMS, params: { goal, step, projectId } });
        promptBuilder.addContext({ contentType: ContentType.ARTIFACTS_EXCERPTS, params: params.context?.artifacts });
        promptBuilder.addContext({ contentType: ContentType.CONVERSATION, params: params.context?.threadPosts });
        
        promptBuilder.addInstruction(`Create a new recurring task based on this goal.
            Specify:
            1. A clear task description
            2. How often it should recur (Daily, Weekly, or Monthly)
            3. A user-friendly confirmation message`);
            
        const structuredPrompt = new StructuredOutputPrompt(schema, promptBuilder);

        try {
            const response = await this.modelHelpers.generate<TaskCreationResponse>({
                message: goal,
                instructions: structuredPrompt,
                threadPosts: params.context?.threadPosts || []
            });

            const { taskDescription, recurrencePattern, responseMessage } = response;

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
                finished: params.executionMode === "task" ? true : true,
                needsUserInput: false,
                replan: ReplanType.Allow,
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
