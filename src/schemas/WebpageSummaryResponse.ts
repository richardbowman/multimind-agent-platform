import { JSONSchema } from 'src/llm/ILLMService';

export interface WebpageSummaryResponse {
    /**
     * Markdown formatted summary of relevant content
     */
    summary: string;
    
    /**
     * Whether the content is relevant to the task
     */
    relevance: "relevant" | "not_relevant";
}

export const WebpageSummarySchema: JSONSchema = {
    type: "object",
    properties: {
        summary: {
            type: "string",
            description: "Markdown formatted summary of relevant content"
        },
        relevance: {
            type: "string",
            enum: ["relevant", "not_relevant"],
            description: "Whether the content is relevant to the task"
        }
    },
    required: ["summary", "relevance"]
};
