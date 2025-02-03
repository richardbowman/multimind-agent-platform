export interface NextActionResponse {
    /** A supported action type */
    actionType: string;
    /** The goal for performing this action type */
    taskDescription: string;
    /** The sequence you are planning to follow (or "none") */
    sequence: string;
    /** Revised user goal */
    revisedUserGoal?: string;
}
