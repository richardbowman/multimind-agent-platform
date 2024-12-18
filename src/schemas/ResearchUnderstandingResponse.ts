import { ModelResponse } from "./ModelResponse";

/**
 * Response interface for research goal understanding analysis
 * @schema ResearchUnderstandingResponse
 */
export interface ResearchUnderstandingResponse extends ModelResponse {
    /** Whether the research request is clear enough to proceed */
    proceedWithResearch: boolean;

    /** Proposed details and assumptions to clarify the research scope */
    proposedDetails: {
        /** The specific detail or assumption being proposed */
        detail: string;
        /** Confidence level in this assumption (0-1) */
        confidence: number;
        /** Explanation of why this detail matters */
        reasoning: string;
    }[];

    /** Your understanding of the research goal */
    goal: string;
}
