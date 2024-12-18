import { ModelResponse } from "./ModelResponse";

/**
 * Response interface for research goal understanding analysis
 * @schema ResearchUnderstandingResponse
 */
export interface ResearchUnderstandingResponse extends ModelResponse {
    /** Whether the research request is clear enough to proceed */
    proceedWithResearch: boolean;

    /** Questions needed to clarify any ambiguous aspects of the research goals */
    questions: string[];

    /** Your understanding of the research goal */
    goal: string;
}
