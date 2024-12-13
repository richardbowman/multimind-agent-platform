export interface AnswerAnalysis {
    questionId: string;
    answered: boolean;
    analysis: string;
    extractedAnswer: string;
}

export interface AnswerAnalysisResponse {
    answers: AnswerAnalysis[];
    summary: string;
}
