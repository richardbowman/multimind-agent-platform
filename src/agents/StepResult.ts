import { ModelResponse } from 'src/schemas/ModelResponse';


export interface StepResult {
    type?: string;
    projectId?: string;
    taskId?: string;
    finished?: boolean;
    goal?: string;
    allowReplan?: boolean;
    needsUserInput?: boolean;
    response: ModelResponse;
}
