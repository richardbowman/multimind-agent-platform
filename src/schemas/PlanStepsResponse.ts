export interface PlanStepTask {
    actionType: string;
    context: string;
    existingId?: string;
}

export interface PlanStepsResponse {
    steps: PlanStepTask[];
}
