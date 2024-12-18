import { ModelMessageResponse } from "./ModelResponse";

export interface AnswerAnalysis {
    questionId: string;
    answered: boolean;
    analysis: string;
    extractedAnswer?: string;
}

export interface AnswerAnalysisResponse extends ModelMessageResponse {
    answers: AnswerAnalysis[];
}
