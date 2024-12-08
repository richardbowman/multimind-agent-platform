
export interface ModelResponse {
    message: string;
}

export interface RequestArtifacts extends ModelResponse {
    artifactIds?: string[];
}

export interface CreateArtifact extends ModelResponse {
    artifactTitle: string;
    artifactId: string;
}
