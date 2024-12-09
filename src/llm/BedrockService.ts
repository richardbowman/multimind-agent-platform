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

    constructor(modelId: string = "anthropic.claude-v2", lmStudioService?: LMStudioService) {
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
        const prompt = this.formatPrompt(instructions, userPost.message, history);
        
        const command = new InvokeModelCommand({
            modelId: this.modelId,
            body: JSON.stringify({
                prompt: prompt,
                max_tokens_to_sample: 2048,
                temperature: 0.7
            })
        });

        try {
            const response = await this.client.send(command);
            const result = JSON.parse(new TextDecoder().decode(response.body));
            return {
                message: result.completion
            };
        } catch (error) {
            Logger.error("Bedrock API error:", error);
            throw error;
        }
    }

    private formatPrompt(instructions: string, message: string, history?: ChatPost[]): string {
        // Format prompt according to Bedrock's expected format
        let prompt = `\n\nHuman: ${instructions}\n\nAssistant: I understand. I'll help with that.\n\nHuman: ${message}\n\nAssistant:`;
        return prompt;
    }

    async sendMessageToLLM(message: string, history: any[], seedAssistant?: string): Promise<string> {
        const command = new InvokeModelCommand({
            modelId: this.modelId,
            body: JSON.stringify({
                prompt: message,
                max_tokens_to_sample: 2048
            })
        });

        const response = await this.client.send(command);
        const result = JSON.parse(new TextDecoder().decode(response.body));
        return result.completion;
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
