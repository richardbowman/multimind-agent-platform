export interface PlanStepTask {
    actionType: string;
    description?: string;
}

export interface GoalAndPlanResponse {
    goal: string;
    plan: PlanStepTask[];
    message: string;
}
