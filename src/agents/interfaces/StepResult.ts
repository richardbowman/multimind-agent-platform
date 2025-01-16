import { ModelResponse } from 'src/schemas/ModelResponse';

export enum StepResultType {
    DecomposeResearch = "decompose-research",
    Question = "Question",
    AnswerQuestion = "AnswerQuestion",
    ComplexProjectKickoff = "ComplexProjectKickoff"
}

export interface StepResult {
    type?: StepResultType;
    projectId?: string;
    taskId?: string;
    finished?: boolean;
    goal?: string;
    allowReplan?: boolean;
    needsUserInput?: boolean;
    response: ModelResponse;
}
