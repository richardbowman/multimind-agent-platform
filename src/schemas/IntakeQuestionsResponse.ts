export interface IntakeQuestion {
    question: string;
    purpose: string;
}

export interface IntakeQuestionsResponse {
    intakeQuestions: IntakeQuestion[];
    reasoning: string;
    goalRestatement: string;
    followupMessage: string;
}
