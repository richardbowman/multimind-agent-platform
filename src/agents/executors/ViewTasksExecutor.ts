import { UUID } from "crypto";
import { ChatClient } from "src/chat/chatClient";
import { getGeneratedSchema } from "src/helpers/schemaUtils";
import { SchemaType } from "src/schemas/SchemaTypes";
import { TaskManager } from "src/tools/taskManager";
import { StepExecutorDecorator } from "../decorators/executorDecorator";
import { ExecuteParams } from "../interfaces/ExecuteParams";
import { ExecutorConstructorParams } from "../interfaces/ExecutorConstructorParams";
import { ExecutorType } from "../interfaces/ExecutorType";
import { StepExecutor } from "../interfaces/StepExecutor";
import { StepResult, StepResponse, ReplanType, StepResponseType } from "../interfaces/StepResult";

@StepExecutorDecorator(ExecutorType.VIEW_TASKS, 'View tasks for a specific user or agent (for "taskDescription", put ONLY the chat handle starting with an @ sign, use @user for the user.)')
export class ViewTasksExecutor implements StepExecutor<StepResponse> {
    private taskManager: TaskManager;
    private chatClient: ChatClient;

    constructor(params: ExecutorConstructorParams) {
        this.taskManager = params.taskManager!;
        this.chatClient = params.chatClient;
    }

    async execute(params: ExecuteParams): Promise<StepResult<StepResponse>> {
        // Get handle from context
        const handle = params.stepGoal;
        if (!handle) {
            return {
                type: "view_tasks",
                finished: true,
                response: {
                    message: 'No user/agent handle provided to view tasks'
                }
            };
        }

        // Get user ID from handle
        const handles = await this.chatClient.getHandles();
        const userId = Object.entries(handles).find(([id, h]) => h === handle)?.[0] as UUID | undefined;
        
        if (!userId) {
            return {
                type: "view_tasks",
                finished: true,
                response: {
                    message: `Could not find user/agent with handle ${handle}`
                }
            };
        }

        // Find all projects with tasks assigned to this user
        const allProjects = await this.taskManager.getProjects();
        const userTasks = allProjects
            .flatMap(project => 
                Object.values(project.tasks)
                    .filter(task => task.assignee === userId)
                    .map(task => ({
                        ...task,
                        projectName: project.name
                    }))
            );

        if (userTasks.length === 0) {
            return {
                type: "view_tasks",
                finished: true,
                response: {
                    message: `No tasks found for ${handle}`
                }
            };
        }

        // Format task list
        const taskList = userTasks.map(task => ({
            id: task.id,
            description: task.description,
            project: task.projectName,
            status: task.status,
            dueDate: task.props?.dueDate?.toISOString().split('T')[0] || 'No due date'
        }));

        return {
            type: "view_tasks",
            finished: true,
            replan: ReplanType.Allow,
            response: {
                type: StepResponseType.Tasks,
                status: `I found ${taskList.length} tasks for ${handle}`,
                data: {
                    messagingHandle: handle,
                    tasks: taskList
                }
            }
        };
    }
}

