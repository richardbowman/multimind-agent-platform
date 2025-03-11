export interface NextActionResponse {
    /** The action to perform next */
    nextAction: string;
    /** The goal for performing this action type */
    taskDescription: string;
    /** The title of procedure guide being followed (or "none") */
    procedureGuideTitle: string;
    /** Revised user goal */
    revisedUserGoal?: string;
}
