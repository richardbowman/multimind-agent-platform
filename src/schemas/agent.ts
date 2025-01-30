import { ModelMessageResponse } from "./ModelResponse";
  
export interface PlanStepTask {
    type: string;
    description?: string;
};

export interface PlanStepsResponse extends ModelMessageResponse {
    steps: PlanStepTask[];
}
