import { PlanStepTask } from "./PlanStepsResponse";

export interface GoalAndPlanResponse {
    plan: PlanStepTask[];
    intention: string;
}


export interface HighLevelPlan {
    plan: string
}

export interface IntentionsResponse {
    plan: string[];
    intention: string;
    /**
     * The plan item we are focused on achieving right now, indexed from 1 to n.
     */
    currentFocus: number;
}
