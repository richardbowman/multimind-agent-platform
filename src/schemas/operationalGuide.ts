/**
 * Represents an operational guide item
 */
export interface OperationalGuide {
    /** Business context description */
    businessContext: string;
    /** Service strategy outline */
    serviceStrategy: string;
    /** Implementation approach details */
    implementationApproach: string;
    /** Key considerations and notes */
    keyConsiderations?: string[];
    /** Recommended implementation steps */
    implementationSteps: ImplementationStep[];
    /** Questions and answers from analysis */
    questionsAndAnswers: QAItem[];
}

/**
 * Represents an implementation step
 */
export interface ImplementationStep {
    /** Step title/name */
    title: string;
    /** Detailed description */
    description: string;
    /** Expected outcome */
    outcome: string;
    /** Timeline estimate */
    timeline?: string;
}

/**
 * Represents a Q&A item
 */
export interface QAItem {
    /** The question asked */
    question: string;
    /** The provided answer */
    answer: string;
    /** Optional category/type */
    category?: string;
}

/**
 * Response wrapper for operational guide
 */
export interface OperationalGuideResponse {
    /** The generated operational guide */
    operationalGuide: OperationalGuide;
    /** Summary of the guide */
    summary: string;
}
