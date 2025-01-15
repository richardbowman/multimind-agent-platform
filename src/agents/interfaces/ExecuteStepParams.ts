import { Task, TaskType } from 'src/tools/taskManager';
import { ExecuteNextStepParams } from './ExecuteNextStepParams';
import { StepResult } from './StepResult';

export interface StepTaskProps {
    result?: StepResult;
}

export interface StepTask extends Task {
    type: TaskType.Step,
    stepType: string;
    props: StepTaskProps;
}

export interface ExecuteStepParams extends ExecuteNextStepParams {
    task: StepTask;
}
