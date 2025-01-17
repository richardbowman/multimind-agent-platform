import { JSONSchema } from 'src/llm/ILLMService';

export interface UrlExtractionResponse {
    /**
     * Array of URLs extracted from the text
     */
    urls: string[];
}

export const UrlExtractionSchema: JSONSchema = {
    type: "object",
    properties: {
        urls: {
            type: "array",
            items: {
                type: "string",
                format: "uri",
                pattern: "^https?://"
            },
            description: "Array of URLs extracted from the text"
        }
    },
    required: ["urls"]
};
