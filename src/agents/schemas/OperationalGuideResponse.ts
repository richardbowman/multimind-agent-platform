export interface ImplementationStep {
    phase: string;
    description: string;
    expectedOutcome: string;
    considerations?: string;
}

export interface OperationalGuide {
    businessContext: string;
    serviceStrategy: string;
    implementationApproach: string;
    keyConsiderations?: string[];
    recommendedSteps: ImplementationStep[];
}

export interface OperationalGuideResponse {
    operationalGuide: OperationalGuide;
    summary: string;
}
