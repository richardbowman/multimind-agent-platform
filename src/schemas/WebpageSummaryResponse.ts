export interface WebpageSummaryResponse {
    /**
     * Markdown formatted summary of relevant content
     */
    summary: string;
    
    /**
     * Whether the content is relevant to the task
     */
    relevance: "relevant" | "not_relevant";
}
