import { ModelResponse } from 'src/schemas/ModelResponse';
import { UUID } from 'src/types/uuid';

export enum StepResultType {
    DecomposeResearch = "decompose-research",
    Question = "Question",
    AnswerQuestion = "AnswerQuestion",
    ComplexProjectKickoff = "ComplexProjectKickoff",
    Validation = "Validation"
}

export enum ReplanType {
    None = "none",
    Allow = "allow", 
    Force = "force"
}

export interface StepResult {
    type?: StepResultType;
    projectId?: UUID;
    taskId?: UUID;
    artifactIds?: UUID[],
    finished?: boolean;
    goal?: string;
    async?: boolean;
    /** @deprecated Use replan instead */
    allowReplan?: boolean;
    replan?: ReplanType;
    needsUserInput?: boolean;
    response: ModelResponse;
}
