import { StructuredOutputPrompt } from "src/llm/ILLMService";
import { definitions } from "./schema.json";

const { ContentDecompositionResponse : CONTENT_DECOMPOSITION_SCHEMA, LookupResearchResponse : LOOKUP_RESEARCH_SCHEMA } = definitions;

// Define the interface for Content Decomposition Response
export interface ContentDecompositionResponse {
    goal: string;
    strategy: string;
    sections: Array<{
        title: string;
        description: string;
    }>;
}

// Define the interface for Lookup Research Response
export interface LookupResearchResponse {
    reinterpreted_goal: string;
    query: string;
}

export const CONTENT_DECOMPOSITION_SYSTEM_PROMPT = `
You are a content orchestrator. Your task is to analyze the user's request and break it down into manageable sections.
1. Restate the user's goal with the content request.
2. Decide how you can craft a high quality outline. If there was an original outline you developed, here it was:
   
3. Create up to ${process.env.MAX_CONTENT_SECTIONS} detailed section descriptions based on the main topic.
4. Provide only a JSON object in the format:
{
    "goal": "restate the user's requested goal for the content",
    "strategy": "how i will approach this from an organizational standpoint",
    "sections": [
        {
            "title": "Section 1",
            "description": "Specific details on what this section should include"
        },
        ...
    ]
}
`;


export const LOOKUP_RESEARCH_SYSTEM_PROMPT = `
    You are an assistant. Your task is to interpret the user's request and restate it.
    Additionally, generate a specific and concise search query based on the interpreted goal.

    Provide only a JSON object in the format:
    {
        "reinterpreted_goal": "restated version of the user's requested goal",
        "query": "search query for the RAG system"
    }
`;

export const ContentDecompositionPrompt = new StructuredOutputPrompt(
    CONTENT_DECOMPOSITION_SCHEMA,
    CONTENT_DECOMPOSITION_SYSTEM_PROMPT
);

export const LookupResearchPrompt = new StructuredOutputPrompt(
    LOOKUP_RESEARCH_SCHEMA,
    LOOKUP_RESEARCH_SYSTEM_PROMPT
);

