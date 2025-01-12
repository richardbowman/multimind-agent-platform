import { ModelMessageResponse } from "./ModelResponse";

export interface BrainstormIdea {
    title: string;
    description: string;
    benefits: string;
}

export interface BrainstormResponse extends ModelMessageResponse {
    ideas: BrainstormIdea[];
    summary: string;
    isComplete: boolean;
}
