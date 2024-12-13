import { ModelMessageResponse } from "./ModelResponse";

export interface ArtifactResponseSchema extends ModelMessageResponse {
    artifactTitle: string;
    artifactContent: string;
}