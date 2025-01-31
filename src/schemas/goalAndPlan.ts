export interface PlanStepTask {
    actionType: string;
    description?: string;
}

export interface GoalAndPlanResponse {
    masterPlan?: {
        goal: string;
        plan: PlanStepTask[];
    };
    subPlan?: {
        goal: string;
        plan: PlanStepTask[];
    };
    message: string;
}
