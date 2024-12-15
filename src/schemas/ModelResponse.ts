
export interface ModelResponse {
    _usage: {
        inputTokens: number,
        outputTokens:number
    }
}

export interface ModelMessageResponse extends ModelResponse {
    message: string;
}

export interface ReasoningResponse extends ModelResponse {
    reasoning: string;
}

export interface RequestArtifacts extends ModelMessageResponse {
    artifactIds?: string[];
}

export interface CreateArtifact extends ModelMessageResponse {
    artifactTitle: string;
    artifactId: string;
}

