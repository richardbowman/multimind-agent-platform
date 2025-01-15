import { Task, TaskType } from 'src/tools/taskManager';
import { ExecuteNextStepParams } from './ExecuteNextStepParams';
import { StepResult } from './StepResult';

export interface StepTaskProps {
    result?: StepResult;
    stepType: string;
}

export interface StepTask extends Task {
    type: TaskType.Step,
    props: StepTaskProps;
}

export interface ExecuteStepParams extends ExecuteNextStepParams {
    task: StepTask;
}
