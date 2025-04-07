export interface NextActionResponse {
    /** The action to perform next */
    nextAction: string;
    /** The title of procedure guide being followed (or "none") */
    procedureGuideTitle: string;
    /** Summarize the entire conversation */
    conversationSummary: string;
}
