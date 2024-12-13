export interface ThinkingResponse {
    /**
     * Step-by-step reasoning process
     */
    reasoning: string;

    /**
     * Final conclusion based on the reasoning
     */
    conclusion: string;
}
