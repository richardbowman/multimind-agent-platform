export enum PlannerType {
    NextStep = "nextStep"
}

export interface ExecutorConfig {
    className: string;
    config?: Record<string, any>;
}

export interface AgentConfig {
    purpose: string;
    finalInstructions: string;
    supportsDelegation: boolean;
    plannerType: PlannerType;
    executors: ExecutorConfig[];
}
