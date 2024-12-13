/**
 * Interface for goal confirmation response
 */
export interface GoalConfirmationResponse {
    /**
     * A clear restatement of the goal and confirmation of understanding
     */
    message: string;

    /**
     * Whether the goal is clear and actionable
     */
    understanding: boolean;
}
