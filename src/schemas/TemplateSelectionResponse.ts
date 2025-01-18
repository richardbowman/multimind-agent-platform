export interface TemplateSelectionResponse {
    /**
     * The ID of the selected template
     */
    selectedTemplateId: string;

    /**
     * Explanation of why this template was chosen
     */
    reasoning: string;

    /**
     * Suggested modifications to the template
     */
    suggestedModifications?: string[];

    /**
     * Any additional notes about the selection
     */
    notes?: string;
}