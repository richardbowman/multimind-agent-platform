export interface CodeExecutionResponse {
    code: string;
    explanation: string;
    result?: {
        returnValue: any;
        consoleOutput?: string;
    };
}
