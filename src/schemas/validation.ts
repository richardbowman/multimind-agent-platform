import { ModelResponse } from "./ModelResponse";

export interface ValidationResult extends ModelResponse {
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
