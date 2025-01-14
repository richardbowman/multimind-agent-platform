import { Task } from 'src/tools/taskManager';
import { ExecuteNextStepParams } from './ExecuteNextStepParams';


export interface ExecuteStepParams extends ExecuteNextStepParams {
    task: Task;
}
