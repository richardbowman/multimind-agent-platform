import { ModelResponse } from './LLMInterfaces';

/**
 * Response interface for research goal understanding analysis
 * @schema ResearchUnderstandingResponse
 */
export interface ResearchUnderstandingResponse extends ModelResponse {
    /** Whether the research request is clear enough to proceed */
    isUnderstandable: boolean;

    /** Questions needed to clarify any ambiguous aspects of the research goals */
    clarifyingQuestions: string[];

    /** Detailed explanation of current understanding of the research goals */
    understanding: string;

    /** Analysis of why the request is/isn't understandable and what aspects need clarification */
    reasoning: string;
}
