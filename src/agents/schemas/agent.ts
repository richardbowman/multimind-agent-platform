
/*
requiresUserInput: boolean;
    userQuestion?: string;
    existingArtifacts?: {
        id: string;
        content: string;
        title: string;
        underlyingData: string;
    }[];*/

import { ModelMessageResponse } from "./ModelResponse";
import { Task } from "../../tools/taskManager";

  
export interface PlanStepTask {
    type: string;
    description?: string;
    existingId: string;
};

export interface PlanStepsResponse extends ModelMessageResponse {
    steps: PlanStepTask[];
}
