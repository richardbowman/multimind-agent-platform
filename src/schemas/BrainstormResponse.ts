import { ModelMessageResponse } from "./ModelResponse";

export interface BrainstormIdea {
    title: string;
    description: string;
    benefits: string;
}

export interface BrainstormResponse {
    topic: string;
    ideas: BrainstormIdea[];
    isComplete: boolean;
}
