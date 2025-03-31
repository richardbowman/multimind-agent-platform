import { ModelResponse } from "./ModelResponse";

/**
 * Response from analyzing goal progress
 */
export interface GoalProgressResponse extends ModelResponse {
    /**
     * Detailed analysis of each goal's progress
     */
    goalAnalysis: Array<{
        goalIndex: string;
        status: 'pending' | 'inProgress' | 'completed';
        reasoning: string;
    }>;
}
