import { ModelResponse } from "./ModelResponse";

export interface ArtifactResponseSchema extends ModelResponse {
    artifactTitle: string;
    artifactContent: string;
}