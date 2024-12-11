
/*
requiresUserInput: boolean;
    userQuestion?: string;
    existingArtifacts?: {
        id: string;
        content: string;
        title: string;
        underlyingData: string;
    }[];*/

import { ModelResponse } from "./ModelResponse";
import { Task } from "../../tools/taskManager";

  
export interface PlanStepTask {
    type: string;
    description?: string;
    existingId: string;
};

export interface PlanStepsResponse extends ModelResponse {
    steps: PlanStepTask[];
}
