import { ExecutorConstructorParams } from '../interfaces/ExecutorConstructorParams';
import { StepExecutor } from '../interfaces/StepExecutor';
import { StepResult, ReplanType } from '../interfaces/StepResult';
import { StructuredOutputPrompt } from "src/llm/ILLMService";
import { ModelHelpers } from '../../llm/modelHelpers';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { TaskManager, RecurrencePattern, Task } from '../../tools/taskManager';
import { TaskStatus } from 'src/schemas/TaskStatus';
import Logger from '../../helpers/logger';
import { getGeneratedSchema } from '../../helpers/schemaUtils';
import { SchemaType } from '../../schemas/SchemaTypes';
import { ContentType } from 'src/llm/promptBuilder';
import { TaskCreationResponse, UpdateActions } from '../../schemas/taskCreation';
import moment from 'moment';

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
import { TaskListResponse } from '../../schemas/taskList';
import { ExecuteParams } from '../interfaces/ExecuteParams';
import { UUID } from 'src/types/uuid';
import { ExecutorType } from '../interfaces/ExecutorType';
import { ChatClient } from 'src/chat/chatClient';

@StepExecutorDecorator(ExecutorType.CREATE_TASK, 'Create, update, complete, cancel, and delete a task')
export class ScheduleTaskExecutor implements StepExecutor {
    private modelHelpers: ModelHelpers;
    private taskManager: TaskManager;
    private userId: UUID;
    private chatClient: ChatClient;

    constructor(params: ExecutorConstructorParams) {
        this.modelHelpers = params.modelHelpers;
        this.userId = params.userId;
        this.taskManager = params.taskManager!;
        this.chatClient = params.chatClient;
    }

    async execute(params: ExecuteParams): Promise<StepResult<StepResponse>> {
        const { goal, step, projectId } = params;
        const schema = await getGeneratedSchema(SchemaType.TaskCreationResponse);

        // Create prompt using PromptBuilder
        const promptBuilder = this.modelHelpers.createPrompt();

        // Add core instructions
        promptBuilder.addInstruction(this.modelHelpers.getFinalInstructions());

        const messagingHandle = (await this.chatClient.getHandles())[this.userId];

        let channelProject = params.context?.projects?.find(p => p.metadata.tags?.includes("channel-goals"));

        // Add existing tasks if we have a project                                                                                  
        if (channelProject) {
            promptBuilder.addContext({
                contentType: ContentType.TASKS,
                tasks: Object.values(channelProject.tasks)
            });
        }

        params.previousResponses && promptBuilder.addContext({ contentType: ContentType.STEP_RESPONSE, responses: params.previousResponses });
        promptBuilder.addContext({ contentType: ContentType.CHANNEL_GOALS, tasks: params.channelGoals });
        params.overallGoal && promptBuilder.addContext({ contentType: ContentType.OVERALL_GOAL, goal: params.overallGoal });
        promptBuilder.addContext({ contentType: ContentType.EXECUTE_PARAMS, params });
        params.context?.artifacts && promptBuilder.addContext({
            contentType: ContentType.ARTIFACTS_EXCERPTS, artifacts:
                params.context?.artifacts
        });
        params.agents && promptBuilder.addContext({ contentType: ContentType.AGENT_OVERVIEWS, agents: params.agents });

        promptBuilder.addInstruction(`Create, update, complete, or remove a task based on this goal.                                                   
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
            2. How often it should recur (Daily, Weekly, Monthly, One-time, or None)                                                
            3. Who the task should be assigned to (@user, myself (${messagingHandle}), or other agent's chat handle)                    
            4. A user-friendly confirmation message                                                                                 
            5. Optional due date (in ISO duration or datetime. e.g. 10 minutes from now... PT10M)  

            If this is a task removal, specify:
            1. The task ID to remove
            2. A user-friendly confirmation message`);

        const structuredPrompt = new StructuredOutputPrompt(schema, promptBuilder);

        try {
            const response = await this.modelHelpers.generate<TaskCreationResponse>({
                message: goal,
                instructions: structuredPrompt,
                threadPosts: params.context?.threadPosts || []
            });

            const {
                action,
                taskId,
                taskDescription,
                recurrencePattern,
                assignee,
                responseMessage,
                dueDate // New field for due date
            } = response;

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
                const existingTask = this.taskManager.getTaskById(taskId);
                if (!existingTask) {
                    throw new Error(`Task ${taskId} not found in project ${channelProject.id}`);
                }

                await this.taskManager.cancelTask(existingTask.id);
            } else if (action === UpdateActions.Complete && taskId) {
                // Complete task
                const existingTask = this.taskManager.getTaskById(taskId);
                if (!existingTask) {
                    throw new Error(`Task ${taskId} not found in project ${channelProject.id}`);
                }
                this.taskManager.completeTask(existingTask.id);
            } else if (action === UpdateActions.Update && taskId) {
                // Update existing task
                const existingTask = this.taskManager.getTaskById(taskId);
                if (!existingTask) {
                    throw new Error(`Task ${taskId} not found in project ${channelProject.id}`);
                }

                // Parse due date if provided - handles both ISO strings and duration strings
                const parsedDueDate = dueDate ? parseDueDate(dueDate) : undefined;

                task = await this.taskManager.updateTask(taskId, {
                    ...existingTask,
                    description: taskDescription || existingTask.description,
                    assignee: assigneeId || existingTask.assignee,
                    recurrencePattern: recurrencePattern || existingTask.recurrencePattern,
                    lastRunDate: recurrencePattern !== "One-time" ? new Date() : existingTask.lastRunDate,
                    props: {
                        ...existingTask.props,
                        dueDate: parsedDueDate // Add due date to update
                    }
                });

                if (assigneeId) await this.taskManager.assignTaskToAgent(task, assigneeId);
            } else if (action === UpdateActions.Create) {
                // Parse due date if provided
                const parsedDueDate = dueDate ? new Date(dueDate) : undefined;

                task = await this.taskManager.addTask(channelProject, {
                    description: taskDescription,
                    creator: this.userId,
                    recurrencePattern: recurrencePattern,
                    lastRunDate: recurrencePattern === 'One-time' ? new Date() : undefined,
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
                type: "schedule_task",
                finished: params.executionMode === "task" ? true : true,
                needsUserInput: false,
                projectId: channelProject.id,
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
