import { ModelResponse } from 'src/schemas/ModelResponse';
import { UUID } from 'src/types/uuid';

export enum StepResultType {
    DecomposeResearch = "decompose-research",
    Question = "Question",
    AnswerQuestion = "AnswerQuestion",
    ComplexProjectKickoff = "ComplexProjectKickoff",
    Validation = "Validation"
}

export interface StepResult {
    type?: StepResultType;
    projectId?: UUID;
    taskId?: UUID;
    artifactIds?: UUID[],
    finished?: boolean;
    goal?: string;
    async?: boolean;
    allowReplan?: boolean;
    needsUserInput?: boolean;
    response: ModelResponse;
}
