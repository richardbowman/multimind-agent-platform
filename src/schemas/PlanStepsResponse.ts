import { ReasoningResponse } from "./ModelResponse";

export interface PlanStepTask {
    existingId?: string;
    actionType: string;
    parameters: string;
}

export interface PlanStepsResponse extends ReasoningResponse {
    steps: PlanStepTask[];
}
