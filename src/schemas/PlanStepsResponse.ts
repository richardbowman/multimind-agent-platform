export interface PlanStepTask {
    existingId?: string;
    actionType: string;
    goals: string;
}

export interface PlanStepsResponse {
    steps: PlanStepTask[];
}
