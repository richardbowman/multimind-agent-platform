import { ExecutorConstructorParams } from '../interfaces/ExecutorConstructorParams';
import { StepExecutor } from '../interfaces/StepExecutor';
import { StepResult, ReplanType } from '../interfaces/StepResult';
import { StructuredOutputPrompt } from "src/llm/ILLMService";
import { ModelHelpers } from '../../llm/modelHelpers';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { TaskManager, RecurrencePattern } from '../../tools/taskManager';
import Logger from '../../helpers/logger';
import { getGeneratedSchema } from '../../helpers/schemaUtils';
import { SchemaType } from '../../schemas/SchemaTypes';
import { ContentType } from 'src/llm/promptBuilder';
import { TaskCreationResponse } from '../../schemas/taskCreation';
import { ExecuteParams } from '../interfaces/ExecuteParams';
import { UUID } from 'src/types/uuid';
import { ExecutorType } from '../interfaces/ExecutorType';
import { ChatClient } from 'src/chat/chatClient';

@StepExecutorDecorator(ExecutorType.CREATE_TASK, 'Create or update a task')
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

    async execute(params: ExecuteParams): Promise<StepResult> {
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
                                                                                                                                    
        promptBuilder.addContext({ contentType: ContentType.CHANNEL_GOALS, tasks: params.channelGoals });                           
        params.overallGoal && promptBuilder.addContext({ contentType: ContentType.OVERALL_GOAL, goal: params.overallGoal });        
        promptBuilder.addContext({ contentType: ContentType.EXECUTE_PARAMS, params});                                               
        params.context?.artifacts && promptBuilder.addContext({ contentType: ContentType.ARTIFACTS_EXCERPTS, artifacts:             
params.context?.artifacts });                                                                                                       
        params.agents && promptBuilder.addContext({ contentType: ContentType.AGENT_OVERVIEWS, agents: params.agents });             
                                                                                                                                    
        promptBuilder.addInstruction(`Create, update, or remove a task based on this goal.                                                   
            If this is an update to an existing task, specify:                                                                      
            1. The task ID to update                                                                                                
            2. Updated task description                                                                                             
            3. Updated recurrence pattern                                                                                           
            4. Updated assignee                                                                                                     
            5. A user-friendly confirmation message                                                                                 
                                                                                                                                    
            If this is a new task, specify:                                                                                         
            1. A clear task description                                                                                             
            2. How often it should recur (Daily, Weekly, Monthly, One-time, or None)                                                
            3. Who the task should be assigned to (@user, myself (${messagingHandle}), or other agent's chat handle)                    
            4. A user-friendly confirmation message
                                                                
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

            const { taskId, taskDescription, recurrencePattern, isRecurring, assignee, responseMessage, removeTask } = response;                
                                                                                                                                     
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
                 assigneeId = agent?.userId;                                                                                         
             }                                                                                                                       
                                                                                                                                     
             if (!channelProject) {                                                                                                  
                 channelProject = await this.taskManager.createProject({                                                             
                     name: "Channel Tasks",                                                                                          
                     metadata: {                                                                                                     
                         description: `Created by ${messagingHandle}`,                                                               
                         tags: ["channel-goals"]                                                                                     
                     }                                                                                                               
                 });                                                                                                                 
             }                                                                                                                       
                                                                                                                                     
             let task;
             if (removeTask && taskId) {
                 // Remove existing task
                 const existingTask = channelProject.tasks[taskId];
                 if (!existingTask) {
                     throw new Error(`Task ${taskId} not found in project ${channelProject.id}`);
                 }
                 
                 await this.taskManager.cancelTask(taskId);
             } else if (taskId) {
                 // Update existing task
                 const existingTask = channelProject.tasks[taskId];
                 if (!existingTask) {
                     throw new Error(`Task ${taskId} not found in project ${channelProject.id}`);
                 }
                 
                 task = await this.taskManager.updateTask(channelProject.id, {
                     ...existingTask,
                     description: taskDescription || existingTask.description,
                     assignee: assigneeId || existingTask.assignee,
                     isRecurring: isRecurring ?? existingTask.isRecurring,
                     recurrencePattern: pattern || existingTask.recurrencePattern,
                     lastRunDate: isRecurring ? new Date() : existingTask.lastRunDate
                 });
             } else {
                 // Create new task
                 task = await this.taskManager.addTask(channelProject, {
                     description: taskDescription,
                     creator: this.userId,
                     assignee: assigneeId,
                     isRecurring: isRecurring,
                     recurrencePattern: pattern,
                     lastRunDate: isRecurring ? new Date() : undefined,
                     complete: false
                 });
             }

             return {
                type: "schedule_task",
                finished: params.executionMode === "task" ? true : true,
                needsUserInput: false,
                projectId: channelProject.id,
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
