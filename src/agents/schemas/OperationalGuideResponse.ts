export interface ImplementationStep {
    phase: string;
    description: string;
    expectedOutcome: string;
    considerations?: string;
}

export interface QAItem {
    question: string;
    answer: string;
    category?: string;
}

export interface OperationalGuide {
    businessContext: string;
    serviceStrategy: string;
    implementationApproach: string;
    keyConsiderations?: string[];
    recommendedSteps: ImplementationStep[];
    questionsAndAnswers: QAItem[];
}

export interface OperationalGuideResponse {
    operationalGuide: OperationalGuide;
    summary: string;
}
