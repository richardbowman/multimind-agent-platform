import { ExecutorConstructorParams } from '../interfaces/ExecutorConstructorParams';
import { BaseStepExecutor, StepExecutor } from '../interfaces/StepExecutor';
import { StepResult, StepResponse, ReplanType } from '../interfaces/StepResult';
import { ModelHelpers } from '../../llm/modelHelpers';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { TaskManager, Task, TaskType, AddTaskParams, RecurrencePattern } from '../../tools/taskManager';
import Logger from '../../helpers/logger';
import { getGeneratedSchema } from '../../helpers/schemaUtils';
import { SchemaType } from '../../schemas/SchemaTypes';
import { ContentType, OutputType } from 'src/llm/promptBuilder';
import { TaskCreationResponse, UpdateActions } from '../../schemas/taskCreation';
import moment from 'moment';
import { ExecuteParams } from '../interfaces/ExecuteParams';
import { asUUID, UUID } from 'src/types/uuid';
import { ExecutorType } from '../interfaces/ExecutorType';
import { ChatClient } from 'src/chat/chatClient';
import { StringUtils } from 'src/utils/StringUtils';

// Helper function to parse due dates from either ISO strings or duration strings
function parseDueDate(dueDate: string): Date {
    // Try parsing as ISO date first
    const isoDate = new Date(dueDate);
    if (!isNaN(isoDate.getTime())) {
        return isoDate;
    }

    // Try parsing as duration string (e.g. "2 days", "1 week", "3 months")
    try {
        const duration = moment.duration(dueDate);
        if (duration.isValid()) {
            return moment().add(duration).toDate();
        }
    } catch (e) {
        // Fall through to error
    }

    throw new Error(`Invalid due date format: ${dueDate}. Must be ISO date string or duration (e.g. "2 days")`);
}

@StepExecutorDecorator(ExecutorType.CREATE_TASK, 'Create, update, complete, cancel, and delete a task')
export class ScheduleTaskExecutor extends BaseStepExecutor<StepResponse> {
    private modelHelpers: ModelHelpers;
    private taskManager: TaskManager;
    private userId: UUID;
    private chatClient: ChatClient;

    constructor(params: ExecutorConstructorParams) {
        super(params);
        this.modelHelpers = params.modelHelpers;
        this.userId = params.userId;
        this.taskManager = params.taskManager!;
        this.chatClient = params.chatClient;
    }

    async execute(params: ExecuteParams): Promise<StepResult<StepResponse>> {
        const { goal, step, projectId } = params;
        const schema = await getGeneratedSchema(SchemaType.TaskCreationResponse);

        // Create prompt using PromptBuilder
        const prompt = this.startModel(params);

        // Add core instructions
        prompt.addInstruction(this.modelHelpers.getFinalInstructions());

        const messagingHandle = (await this.chatClient.getHandles())[this.userId];

        let channelProject = params.context?.projects?.find(p => p.metadata.tags?.includes("channel-goals"));

        // Add existing tasks if we have a project                                                                                  
        if (channelProject) {
            prompt.addContext({
                contentType: ContentType.TASKS,
                tasks: Object.values(channelProject.tasks)
            });
        }

        params.previousResponses && prompt.addContext({ contentType: ContentType.STEP_RESPONSE, responses: params.previousResponses });
        prompt.addContext({ contentType: ContentType.CHANNEL_GOALS, tasks: params.channelGoals });
        params.overallGoal && prompt.addContext({ contentType: ContentType.OVERALL_GOAL, goal: params.overallGoal });
        prompt.addContext({ contentType: ContentType.EXECUTE_PARAMS, params });
        params.context?.artifacts && prompt.addContext({
            contentType: ContentType.ARTIFACTS_EXCERPTS, artifacts:
                params.context?.artifacts
        });
        params.agents && prompt.addContext({ contentType: ContentType.AGENT_OVERVIEWS, agents: params.agents });

        prompt.addInstruction(`Create, update, complete, or remove a task based on this goal.                                                   
            If this is an update to an existing task, specify:
            1. The task ID to update                                                                                                
            2. Updated task description                                                                                             
            3. Updated recurrence pattern                                                                                           
            4. Updated assignee                                                                                                     
            5. A user-friendly confirmation message                                                                                 
            6. Optional due date

            If this is a new task, specify:                                                                                         
            1. A clear task description
                - e.g. if the user asked you to remind them and you are assigning the task to yourself, then your description might be "Remind the user to 
            2. Who the task should be assigned to (@user, myself (${messagingHandle}), or other agent's chat handle)                    
            3. A user-friendly confirmation message                                                                                 
            4. For one-time tasks, Optional due date (in ISO duration or datetime. e.g. 10 minutes from now... PT10M)  
            5. For recurring tasks, How often it should recur (Hourly, Daily, Weekly, Monthly, One-time, or None)                                                

            If this is a task removal, specify:
            1. The task ID to remove
            2. A user-friendly confirmation message`);

        prompt.addOutputInstructions({outputType: OutputType.JSON_WITH_MESSAGE, schema});

        try {
            const response = await prompt.generate({
                message: goal
            });

            const data = StringUtils.extractAndParseJsonBlock<TaskCreationResponse>(response.message, schema);
            const responseMessage = StringUtils.extractNonCodeContent(response.message);

            if (!data) {
                throw new Error("Model didn't provide JSON block");
            }

            const {
                action,
                taskDescription,
                recurrencePattern,
                assignee,
                dueDate
            } = data;
            const taskId = data.taskId && asUUID(data.taskId);

            // Handle assignment                                                                                                    
            let assigneeId: UUID | undefined;
            assigneeId = Object.entries(await this.chatClient.getHandles()).find(h => h[1] === assignee)![0] as UUID;

            if (!channelProject) {
                channelProject = await this.taskManager.createProject({
                    name: "Channel Tasks",
                    metadata: {
                        description: `Created by ${messagingHandle}`,
                        tags: ["channel-goals"]
                    }
                });
            }

            let task: Task;
            if (action === UpdateActions.Delete && taskId) {
                // Remove existing task
                const existingTask = await this.taskManager.getTaskById(taskId);
                if (!existingTask) {
                    throw new Error(`Task ${taskId} not found in project ${channelProject.id}`);
                }

                await this.taskManager.cancelTask(existingTask.id);
            } else if (action === UpdateActions.Complete && taskId) {
                // Complete task
                const existingTask = await this.taskManager.getTaskById(taskId);
                if (!existingTask) {
                    throw new Error(`Task ${taskId} not found in project ${channelProject.id}`);
                }
                await this.taskManager.completeTask(existingTask.id);
            } else if (action === UpdateActions.Update && taskId) {
                // Update existing task
                const existingTask = await this.taskManager.getTaskById(taskId);
                if (!existingTask) {
                    throw new Error(`Task ${taskId} not found in project ${channelProject.id}`);
                }

                // Parse due date if provided - handles both ISO strings and duration strings
                const parsedDueDate = dueDate ? parseDueDate(dueDate) : undefined;

                task = await this.taskManager.updateTask(taskId, {
                    ...existingTask,
                    description: taskDescription || existingTask.description,
                    assignee: assigneeId || existingTask.assignee,
                    ...(recurrencePattern !== 'One-time' ? {
                        recurrencePattern
                    } as Partial<AddTaskParams>: {}),
                    props: {
                        ...existingTask.props,
                        dueDate: parsedDueDate // Add due date to update
                    }
                } as AddTaskParams);

                if (assigneeId) await this.taskManager.assignTaskToAgent(task, assigneeId);
            } else if (action === UpdateActions.Create) {
                // Parse due date if provided
                const parsedDueDate = dueDate ? new Date(dueDate) : undefined;

                task = await this.taskManager.addTask(channelProject, {
                    type: recurrencePattern === 'One-time' ? TaskType.Standard : TaskType.Recurring,
                    description: taskDescription,
                    creator: this.userId,
                    recurrencePattern: recurrencePattern,
                    complete: false,
                    props: {
                        dueDate: parsedDueDate, // Add due date to create,
                        announceChannelId: params.context?.channelId
                    }
                });

                if (assigneeId) await this.taskManager.assignTaskToAgent(task.id, assigneeId);
            } else {
                Logger.error("Improper response, need to handle");
            }

            return {
                finished: params.executionMode === "task" ? true : true,
                replan: ReplanType.Allow,
                projectId: channelProject.id,
                response: {
                    status: responseMessage
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
