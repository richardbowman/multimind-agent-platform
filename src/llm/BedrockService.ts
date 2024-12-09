import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import LMStudioService from "./lmstudioService";
import { ILLMService } from "./ILLMService";
import { ChatPost } from "src/chat/chatClient";
import { ModelResponse } from "../agents/schemas/ModelResponse";
import { StructuredOutputPrompt } from "./lmstudioService";
import { IEmbeddingFunction } from "chromadb";
import Logger from "src/helpers/logger";

export class BedrockService implements ILLMService {
    private client: BedrockRuntimeClient;
    private modelId: string;
    private embeddingModel?: IEmbeddingFunction;
    private lmStudioService?: LMStudioService;

    constructor(modelId: string = "anthropic.claude-3-5-haiku-20241022-v1:0", lmStudioService?: LMStudioService) {
        this.client = new BedrockRuntimeClient({ region: process.env.AWS_REGION });
        this.modelId = modelId;
        this.lmStudioService = lmStudioService;
    }

    async initializeEmbeddingModel(modelPath: string): Promise<void> {
        if (!this.lmStudioService) {
            this.lmStudioService = new LMStudioService();
        }
        await this.lmStudioService.initializeEmbeddingModel(modelPath);
        this.embeddingModel = this.lmStudioService.getEmbeddingModel();
        Logger.info("Using LMStudio for embeddings as Bedrock fallback");
    }

    async initializeLlamaModel(modelPath: string): Promise<void> {
        // No initialization needed for Bedrock
        Logger.info("Bedrock service ready");
    }

    async generate(instructions: string, userPost: ChatPost, history?: ChatPost[]): Promise<ModelResponse> {
        const messages = this.formatMessages(userPost.message, history);
        
        const command = new InvokeModelCommand({
            modelId: this.modelId,
            body: JSON.stringify({
                anthropic_version: "bedrock-2023-05-31",
                max_tokens: 2048,
                temperature: 0.7,
                system: instructions,
                messages: messages
            })
        });

        try {
            const response = await this.client.send(command);
            const result = JSON.parse(new TextDecoder().decode(response.body));
            return {
                message: result.content[0].text
            };
        } catch (error) {
            Logger.error("Bedrock API error:", error);
            throw error;
        }
    }

    private formatMessages(message: string, history?: ChatPost[]): any[] {
        const messages = [];

        // Add chat history if present
        if (history) {
            for (const post of history) {
                messages.push({
                    role: post.user_id === "assistant" ? "assistant" : "user",
                    content: post.message
                });
            }
        }

        // Add the current message
        messages.push({
            role: "user",
            content: message
        });

        return messages;
    }

    async sendMessageToLLM(message: string, history: any[], seedAssistant?: string): Promise<string> {
        let messages = [...history];
        
        // Only add the user message if it's not empty
        if (message.trim()) {
            messages.push({ role: "user", content: message });
        }
        
        // Add seed assistant message if provided
        if (seedAssistant) {
            messages.push({ role: "assistant", content: seedAssistant });
        }

        const command = new InvokeModelCommand({
            modelId: this.modelId,
            body: JSON.stringify({
                anthropic_version: "bedrock-2023-05-31",
                max_tokens: 2048,
                messages: messages
            })
        });

        const response = await this.client.send(command);
        const result = JSON.parse(new TextDecoder().decode(response.body));
        return result.content[0].text;
    }

    async generateStructured(userPost: ChatPost, instructions: StructuredOutputPrompt): Promise<any> {
        // Implement structured generation for Bedrock
        throw new Error("Structured generation not yet implemented for Bedrock");
    }

    getEmbeddingModel(): IEmbeddingFunction {
        if (!this.embeddingModel) throw new Error("Embedding model not initialized");
        return this.embeddingModel;
    }
}
