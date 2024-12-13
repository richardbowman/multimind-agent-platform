/**
 * Represents an analyzed business goal
 */
export class BusinessGoal {
    /** Detailed description of the business goal */
    description: string = '';
}

/**
 * Represents the analysis of business goals
 */
export class GoalsAnalysis {
    /** List of broken down business goals */
    goals: BusinessGoal[] = [];
}
