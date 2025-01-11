import { ModelMessageResponse } from "./ModelResponse";
  
export interface PlanStepTask {
    type: string;
    description?: string;
    existingId?: string;
};

export interface PlanStepsResponse extends ModelMessageResponse {
    steps: PlanStepTask[];
}
