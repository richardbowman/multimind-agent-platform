import { ReasoningResponse } from "./ModelResponse";

export interface PlanStepTask {
    actionType: string;
    context: string;
}

export interface PlanStepsResponse extends ReasoningResponse{
    steps: PlanStepTask[];
    sequence?: string
}
