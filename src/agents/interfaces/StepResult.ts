import { ModelResponse } from 'src/schemas/ModelResponse';
import { UUID } from 'src/types/uuid';

export enum StepResultType {
    DecomposeResearch = "decompose-research",
    Question = "Question",
    AnswerQuestion = "AnswerQuestion",
    ComplexProjectKickoff = "ComplexProjectKickoff",
    Validation = "Validation",
    Thinking = "Thinking",
    CodeGenerationStep = "CodeGenerationStep",
    FinalResponse = "FinalResponse",
    Debug = "Debug",
    Delegation = "Delegation",
    Calendar = "Calendar",
    GenerateIntention = "GenerateIntention"
}

export enum StepResponseType {
    Intent,
    Validation,
    Question

}

export enum ReplanType {
    None = "none",
    Allow = "allow", 
    Force = "force"
}

export interface StepResponse {
    type?: StepResponseType;
    message?: string;
    data?: Record<string, any>;
}

export interface StepResult {
    type?: StepResultType;
    projectId?: UUID;
    taskId?: UUID;
    artifactIds?: UUID[],
    finished?: boolean;
    goal?: string;
    async?: boolean;
    replan?: ReplanType;
    needsUserInput?: boolean;
    response: StepResponse;
}
