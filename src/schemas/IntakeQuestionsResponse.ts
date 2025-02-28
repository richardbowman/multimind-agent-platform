export interface IntakeQuestion {
    question: string;
    purpose: string;
}

export interface IntakeQuestionsResponse {
    /**
     * Restated goal of your best understanding of how to achieve the goal (this will be provided to your follow-up tasks)
     */
    goalRestatement: string;

    /**
     * @description true to proceed with next steps, false to wait for answers from user.
     */
    shouldContinue?: boolean;
}
