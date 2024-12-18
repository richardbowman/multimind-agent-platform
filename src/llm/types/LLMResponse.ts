export interface LLMUsage {
    inputTokens: number;
    outputTokens: number;
}

export interface LLMResponse<T = string> {
    content: T;
    usage?: LLMUsage;
    raw?: any; // Original response from the provider
}
