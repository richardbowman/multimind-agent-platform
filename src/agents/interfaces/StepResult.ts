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
    GenerateIntention = "GenerateIntention",
    WebScrapeStepResult = "WebScrapeStepResult",
    GenerateChartResult = "GenerateChartResult"
}

export enum StepResponseType {
    Intent = "intent",
    Validation = "validation",
    Question = "question",
    CodeResult = "code-result",
    WebPage = "web-page",
    Chart = "chart",
    GeneratedArtifact = "generated-artifact"
}

export enum ReplanType {
    None = "none",
    Allow = "allow", 
    Force = "force"
}

export type WithMessage<T> = T & {
    message?: string;
};

export interface StepResponseData extends Record<string, any> { 

};

export interface StepResponse {
    type?: StepResponseType;
    message?: string;
    data?: StepResponseData;
}

export interface StepResult<TypedStepResponse extends StepResponse> {
    type?: StepResultType;
    projectId?: UUID;
    taskId?: UUID;
    artifactIds?: UUID[],
    finished?: boolean;
    goal?: string;
    async?: boolean;
    replan?: ReplanType;
    needsUserInput?: boolean;
    response: TypedStepResponse;
}
