
export interface ModelMessageResponse {
    message: string;
}

export interface ReasoningResponse {
    reasoning: string;
}

export interface RequestArtifacts extends ModelMessageResponse {
    artifactIds?: string[];
}

export interface CreateArtifact extends ModelMessageResponse {
    artifactTitle: string;
    artifactId: string;
}

