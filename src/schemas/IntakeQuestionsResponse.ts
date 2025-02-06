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
     * @description if you believe we have enough information to proceed with other processing tasks.
     */
    shouldContinue?: boolean;
}
