export interface PlanStepTask {
    existingId?: string;
    actionType: string;
    parameters: string;
}

export interface PlanStepsResponse {
    steps: PlanStepTask[];
    reasoning?: string;
}
