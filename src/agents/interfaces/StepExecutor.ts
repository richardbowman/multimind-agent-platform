import { Task, Project } from 'src/tools/taskManager';
import { ExecuteParams } from './ExecuteParams';
import { StepResult } from './StepResult';


export interface StepExecutor {
    /**
     * @deprecated Use executeV2 instead which provides better parameter organization
     */
    executeOld?(goal: string, step: string, projectId: string, previousResult?: any): Promise<StepResult>;
    execute?(params: ExecuteParams & { executionMode: 'conversation' | 'task' }): Promise<StepResult>;
    onTaskNotification?(task: Task): Promise<void>;
    onProjectCompleted?(project: Project): Promise<void>;
}
