export interface ValidationResult {
    /**
     * Whether the solution fully addresses the original goal
     */
    isComplete: boolean;

    /**
     * List of aspects that still need to be addressed
     */
    missingAspects?: string[];

    /**
     * Explanation of the validation results
     */
    message: string;
}
