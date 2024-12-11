
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

    
export interface PlanStepTask {
    type: string;
    description?: string;
    existingId: string;
};

export interface PlanStepsResponse extends ModelResponse {
    steps: PlanStepTask[];
}
