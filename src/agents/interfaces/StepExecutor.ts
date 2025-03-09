import { Task, Project } from 'src/tools/taskManager';
import { ExecuteParams } from './ExecuteParams';
import { StepResponse, StepResult } from './StepResult';
import { TaskEventType } from '../agents';
import { ChatPost } from 'src/chat/chatClient';


export interface TaskNotification {
    task: Task;
    childTask: Task;
    eventType: TaskEventType;
    statusPost?: ChatPost;
}

export interface StepExecutor<R extends StepResponse> {
    /**
     * @deprecated Use executeV2 instead which provides better parameter organization
     */
    executeOld?(goal: string, step: string, projectId: string, previousResponses?: any): Promise<StepResult<R>>;
    execute?(params: ExecuteParams): Promise<StepResult<R>>;
    onTaskNotification?(task: Task): Promise<void>;
    onProjectCompleted?(project: Project): Promise<void>;
    handleTaskNotification?(notification: TaskNotification): Promise<void>;
    /**
     * Optional method for async executors to provide final StepResult when their sub-project completes
     * @param project The completed project
     * @returns Final StepResult to return to the parent step
     */
    onProjectCompletionResult?(project: Project): Promise<StepResult<R>>;
}
