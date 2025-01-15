
/**
 * Response from checking if an outline has been approved
 */
export interface OutlineApprovalCheck {
    /**
     * Whether the outline has been approved
     */
    approved: boolean;

    /**
     * List of requested changes if not approved
     */
    changesNeeded: string[];

    /**
     * Confidence score (0-100) in the approval assessment
     */
    confidence: number;

    /**
     * Brief summary of the feedback provided
     */
    feedbackSummary: string;
}
