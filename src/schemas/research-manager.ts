import { ModelMessageResponse } from "./ModelResponse";

export interface ResearchDecomposition {
    goal: string;
    strategy: string;
    researchTopic: string[];
}

export interface ResearchArtifactResponse extends ModelMessageResponse {
    artifactTitle: string;
    artifactContent: string;
}
