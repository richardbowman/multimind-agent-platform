import { CreateArtifact, ModelResponse } from 'src/schemas/ModelResponse';
import { Artifact } from 'src/tools/artifact';
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
    GenerateChartResult = "GenerateChartResult",
    GenerateArtifact = "GenerateArtifact",
    Error = "Error",
    TaskCreation = "TaskCreation"
}

export enum StepResponseType {
    Intent = "intent",
    Validation = "validation",
    Question = "question",
    CodeResult = "code-result",
    WebPage = "web-page",
    Chart = "chart",
    GeneratedArtifact = "generated-artifact",
    Tasks = "tasks",
    Plan = "plan",
    Brainstorm = "brainstorm",
    SearchResults = "SearchResults",
    Message = "Message",
    FullArtifact = "FullArtifact",
    CompletionMessage = "CompletionMessage",
    Excerpts = "Chunks",
    Channel = "Channel",
    ChannelTemplates = "ChannelTemplates",
    DocumentTemplate = "DocumentTemplate",
    GoalAssessment = "GoalAssessment",
    DraftContent = "DraftContent",
    Error = "Error"
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
    reasoning?: string;
    status?: string;
    artifacts?: Partial<Artifact>[];
}

export interface StepResult<TypedStepResponse extends StepResponse> {
    type?: StepResultType;
    projectId?: UUID;
    taskId?: UUID;
    artifactIds?: UUID[],
    artifacts?: Partial<Artifact>[],
    finished?: boolean;
    goal?: string;
    async?: boolean;
    replan?: ReplanType;
    needsUserInput?: boolean;
    response: TypedStepResponse;
}
