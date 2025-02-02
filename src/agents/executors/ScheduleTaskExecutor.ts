import { ExecutorConstructorParams } from '../interfaces/ExecutorConstructorParams';
import { StepExecutor } from '../interfaces/StepExecutor';
import { StepResult, ReplanType } from '../interfaces/StepResult';
import { StructuredOutputPrompt } from "src/llm/ILLMService";
import { ModelHelpers } from '../../llm/modelHelpers';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { ILLMService } from '../../llm/ILLMService';
import { TaskManager, RecurrencePattern } from '../../tools/taskManager';
import { Task } from '../../tools/taskManager';
import Logger from '../../helpers/logger';
import { getGeneratedSchema } from '../../helpers/schemaUtils';
import { SchemaType } from '../../schemas/SchemaTypes';
import { ContentType } from 'src/llm/promptBuilder';
import { TaskCreationResponse } from '../../schemas/taskCreation';
import { ExecuteParams } from '../interfaces/ExecuteParams';
import { UUID } from 'src/types/uuid';
import { timeStamp } from 'console';
import { ExecutorType } from '../interfaces/ExecutorType';

@StepExecutorDecorator(ExecutorType.SCHEDULE_TASK, 'Schedule a task')
export class ScheduleTaskExecutor implements StepExecutor {
    private modelHelpers: ModelHelpers;
    private taskManager: TaskManager;
    private userId: UUID;

    constructor(params: ExecutorConstructorParams) {
        this.modelHelpers = params.modelHelpers;
        this.userId = params.userId;
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
        params.overallGoal && promptBuilder.addContext({ contentType: ContentType.OVERALL_GOAL, goal: params.overallGoal });
        promptBuilder.addContext({ contentType: ContentType.EXECUTE_PARAMS, params: { goal, step, projectId } });
        params.context?.artifacts && promptBuilder.addContext({ contentType: ContentType.ARTIFACTS_EXCERPTS, artifacts: params.context?.artifacts });
        
        promptBuilder.addContext({ contentType: ContentType.CONVERSATION, params: params.context?.threadPosts });
        promptBuilder.addContext({ contentType: ContentType.CHANNEL_GOALS, params: params.channelGoals });
        promptBuilder.addContext({ contentType: ContentType.AGENTS, params: params.agents });

        promptBuilder.addInstruction(`Create a new task based on this goal.
            Specify:
            1. A clear task description
            2. How often it should recur (Daily, Weekly, Monthly, One-time, or None)
            3. Who the task should be assigned to (@user or an agent's chat handle)
            4. A user-friendly confirmation message`);
            
        const structuredPrompt = new StructuredOutputPrompt(schema, promptBuilder);

        try {
            const response = await this.modelHelpers.generate<TaskCreationResponse>({
                message: goal,
                instructions: structuredPrompt,
                threadPosts: params.context?.threadPosts || []
            });

            const { taskDescription, recurrencePattern, isRecurring, assignee, responseMessage } = response;

            // Map string pattern to enum
            const pattern = {
                'Daily': RecurrencePattern.Daily,
                'Weekly': RecurrencePattern.Weekly,
                'Monthly': RecurrencePattern.Monthly,
                'One-time': undefined,
                'None': undefined
            }[recurrencePattern];

            // Handle assignment
            let assigneeId: UUID | undefined;
            if (assignee === '@user') {
                assigneeId = this.userId;
            } else {
                // Find agent by messaging handle
                const agent = params.agents?.find(a => a.messagingHandle === assignee);
                assigneeId = agent?.id;
            }

            // Add task to project
            const project = await this.taskManager.getProject(projectId);
            const task = await this.taskManager.addTask(project, {
                description: taskDescription,
                creator: this.userId,
                assignee: assigneeId,
                isRecurring: isRecurring,
                recurrencePattern: pattern,
                lastRunDate: isRecurring ? new Date() : undefined,
                complete: false
            });

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
