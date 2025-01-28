import { Task, TaskType } from 'src/tools/taskManager';
import { ExecuteNextStepParams } from './ExecuteNextStepParams';
import { StepResult } from './StepResult';
import { ExecutorType } from './ExecutorType';

export interface StepTaskProps {
    result?: StepResult;
    stepType: ExecutorType;
    awaitingResponse?: boolean
}

export interface StepTask extends Task {
    type: TaskType.Step,
    props: StepTaskProps;
}

export interface ExecuteStepParams extends ExecuteNextStepParams {
    task: StepTask;
}
