export interface PlanStepTask {
    existingId?: string;
    type: string;
    description: string;
}

export interface PlanStepsResponse {
    steps: PlanStepTask[];
    reasoning?: string;
}
