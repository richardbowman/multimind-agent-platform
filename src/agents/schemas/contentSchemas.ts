import { StructuredOutputPrompt } from "src/llm/lmstudioService";

export const CONTENT_DECOMPOSITION_SCHEMA = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "title": "Content Decomposition Response",
    "type": "object",
    "properties": {
        "goal": {
            "type": "string"
        },
        "strategy": {
            "type": "string"
        },
        "sections": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "title": {
                        "type": "string"
                    },
                    "overview": {
                        "type": "string"
                    }
                },
                "required": ["title", "overview"]
            }
        }
    },
    "required": ["goal", "strategy", "sections"]
};

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
            "overview": "High level overview of this section"
        },
        ...
    ]
}
`;

export const LOOKUP_RESEARCH_SCHEMA = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "title": "Lookup Research Response",
    "type": "object",
    "properties": {
        "reinterpreted_goal": {
            "type": "string"
        },
        "query": {
            "type": "string"
        }
    },
    "required": ["reinterpreted_goal", "query"]
};

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

