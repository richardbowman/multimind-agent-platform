export interface QAAnswers {
    question: string;
    answer: string;
    analysis: string;
    answeredAt: Date;
}

export interface AnswerAnalysis {
    questionIndex: number;
    answered: boolean;
    analysis: string;
    extractedAnswer: string;
}

export interface AnswerAnalysisResponse {
    answers: AnswerAnalysis[];
    shouldContinue: boolean;
}
