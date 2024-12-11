
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
import { Task } from "../../tools/taskManager";

export interface PlanStepTask {
    existingId?: string;
    type: string;
    description?: string;
}

export interface PlanStepsResponse {
    steps: PlanStepTask[];
    reasoning: string;
    message: string;
    artifactIds?: string[];
    projectId?: string;
}
