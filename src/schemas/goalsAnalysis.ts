/**
 * Represents an analyzed business goal
 */
export interface BusinessGoal {
    /** Detailed description of the business goal */
    description: string;
}

/**
 * Represents the analysis of business goals
 */
export interface GoalsAnalysis {
    /** List of broken down business goals */
    goals: BusinessGoal[];
}
