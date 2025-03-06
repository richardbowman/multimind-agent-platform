import { Task, Project } from 'src/tools/taskManager';
import { ExecuteParams } from './ExecuteParams';
import { StepResponse, StepResult } from './StepResult';


export interface TaskNotification {
    task: Task;
    eventType: TaskEventType;
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
}
