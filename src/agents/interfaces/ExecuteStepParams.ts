import { Task, TaskType } from 'src/tools/taskManager';
import { ExecuteNextStepParams } from './ExecuteNextStepParams';
import { StepResponse, StepResult } from './StepResult';
import { ExecutorType } from './ExecutorType';
import { UUID } from 'src/types/uuid';

export interface StepTaskProps<T extends StepResponse> {
    result?: StepResult<T>;
    stepType: ExecutorType;
    awaitingResponse?: boolean;
    userPostId?: UUID;
    responsePostId?: UUID;
}

export interface StepTask<T extends StepResponse> extends Task {
    type: TaskType.Step,
    props: StepTaskProps<T>;
}

export interface ExecuteStepParams<T extends StepResponse> extends ExecuteNextStepParams {
    task: StepTask<T>;
}
