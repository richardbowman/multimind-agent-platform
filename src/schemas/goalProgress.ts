import { ModelResponse } from "./ModelResponse";

/**
 * Response from analyzing goal progress
 */
export interface GoalProgressResponse extends ModelResponse {
    /**
     * Summary of goal progress analysis
     */
    summary: string;
    
    /**
     * List of goal IDs that were updated
     */
    goalsUpdated: string[];
    
    /**
     * List of goal IDs that should be marked in-progress
     */
    goalsInProgress: string[];
    
    /**
     * List of goal IDs that should be marked complete
     */
    goalsCompleted: string[];
    
    /**
     * Detailed analysis of each goal's progress
     */
    goalAnalysis: Array<{
        goalId: string;
        progress: number; // 0-1
        status: 'pending' | 'in-progress' | 'complete';
        reasoning: string;
        nextSteps?: string[];
    }>;
}
