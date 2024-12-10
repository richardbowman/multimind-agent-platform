// lmstudioService.ts

import { EmbeddingSpecificModel,LLMPredictionOpts,LLMSpecificModel,LMStudioClient } from "@lmstudio/sdk";
import { IEmbeddingFunction } from "chromadb";
import Logger from "src/helpers/logger";
import JSON5 from "json5";
import { ChatPost } from "src/chat/chatClient";
import { ModelResponse } from "../agents/schemas/ModelResponse";

class MyEmbedder implements IEmbeddingFunction {
    private embeddingModel: EmbeddingSpecificModel;

    constructor(embeddingModel: EmbeddingSpecificModel) {
        this.embeddingModel = embeddingModel;
    }   

    async generate(texts: string[]): Promise<number[][]> {
        const embeddings: number[][] = [];
        for (const text of texts) {
            const modelEmbedding = await this.embeddingModel.embedString(text);
            embeddings.push(modelEmbedding.embedding);
        }
        return embeddings;
    }
}

export class StructuredOutputPrompt {
    private schema: any;
    private prompt: string;

    constructor(schema: any, prompt: string) {
        this.schema = schema;
        this.prompt = prompt;
    }

    public getSchema(): any {
        return this.schema;
    }

    public getPrompt(): string {
        return this.prompt;
    }
}

export enum ModelRole {
    USER = "user",
    ASSISTANT = "assistant"
}

export interface ModelMessageHistory {
    role: ModelRole;
    content: string;
}

export interface MessageOpts {
    contextWindowLength?: number;
}

import { ILLMService } from "./ILLMService";

export default class LMStudioService implements ILLMService {
    private lmStudioClient: LMStudioClient;
    private embeddingModel?: IEmbeddingFunction;
    private chatModel?: LLMSpecificModel;

    constructor() {
        this.lmStudioClient = new LMStudioClient({
            baseUrl: process.env.LMSTUDIO_BASEURL!
        });
    }
    getTokenCount(message: string): Promise<number> {
        if (!this.chatModel) throw new Error("LM Studio not initalized");
        return this.chatModel.unstable_countTokens(message);
    }

    async initializeEmbeddingModel(modelPath: string): Promise<void> {
        try {
            const loadedModels = await this.lmStudioClient.embedding.listLoaded();
            if (loadedModels.find((model) => model.identifier === modelPath) !== undefined) {
                this.embeddingModel = new MyEmbedder(await this.lmStudioClient.embedding.get(modelPath));
                Logger.info("Connected to existing embedding model.");
            } else {
                this.embeddingModel = new MyEmbedder(await this.lmStudioClient.embedding.load(modelPath));
                Logger.info("Embedding model loaded.");
            }
        } catch (error) {
            Logger.error("Failed to initialize embedding model:", error);
            throw error;
        }
    }

    async initializeLlamaModel(modelPath: string): Promise<void> {
        try {
            const loaded = await this.lmStudioClient.llm.listLoaded();
            if (loaded.find((model) => model.identifier === modelPath) !== undefined) {
                this.chatModel = await this.lmStudioClient.llm.get(modelPath);
                Logger.info("Connected to existing LLaMA model.");
            } else {
                this.chatModel = await this.lmStudioClient.llm.load(modelPath, {verbose: false});
                Logger.info("LLaMA model loaded.");
            }
        } catch (error) {
            Logger.error("Failed to initialize LLaMA model:", error);
            throw error;
        }
    }

    async generate(instructions: string, userPost: ChatPost, history?: ChatPost[], opts?: MessageOpts) : Promise<ModelResponse> {
        const currentDate = new Date().toISOString().split('T')[0];
        const messageChain = [
            {
                role: "system",
                content: `Current date: ${currentDate}\n\n${instructions}`
            },
            ...this.mapPosts(userPost, history),
            {
                role: ModelRole.USER,
                content: userPost.message
            }            
        ];
        const result = await this.getChatModel().respond(messageChain, {});
        return {
            message: result.content
        };
    }

    async sendMessageToLLM(message: string, history: any[], seedAssistant?: string, 
        contextWindowLength?: number, maxTokens?: number, schema?: object): Promise<string> {
        if (!this.chatModel) {
            throw new Error("LLaMA model is not initialized.");
        }

        // Add the current message to the history
        const userMessage = { role: "user", content: message };
        history.push(userMessage);

        if (seedAssistant) {
            // Add the assistant's message to the history
            const assistantMessage = { role: "assistant", content: seedAssistant };
            history.push(assistantMessage);
        }

        // // If contextWindowLength is provided, truncate the history
        // const contextLength = parseInt(process.env.CONTEXT_SIZE||"") || contextWindowLength || 4096;
        // let tokenCount = 0;
        // for (let i = history.length - 1; i >= 0; i--) {
        //     const messageTokens = await this.chatModel.unstable_countTokens(history[i].content);
        //     tokenCount += messageTokens;

        //     if (tokenCount > contextLength) {
        //         history = history.slice(i + 1);
        //         break;
        //     }
        // }

        const opts : LLMPredictionOpts = { maxPredictedTokens: maxTokens  };
        if (schema) {
            opts.structured = { type: "json", jsonSchema: schema }; 
        }

        // Set the maxTokens parameter for the LLaMA model
        const prediction = this.chatModel.respond(history, opts);
        const finalResult = await prediction;
        const resultBody = finalResult.content;

        const inclSeed = (resultBody.length > 0 ? ((seedAssistant || "") + resultBody.trim()) : "");

        // Remove the last message from the history (user's message)
        return inclSeed;
    }

    mapPosts(userPost: ChatPost, posts?: ChatPost[]) : ModelMessageHistory[] {
        if (!posts) return [];
        return posts.map(h => ({
            role: h.user_id === userPost.user_id ? ModelRole.USER : ModelRole.ASSISTANT,
            content: h.message
        }));
    }

    async sendStructuredRequest(message: string, instructions: StructuredOutputPrompt, history?: any[],  
        contextWindowLength?: number, maxTokens?: number): Promise<any> {
        if (!this.chatModel) {
            throw new Error("LLaMA model is not initialized.");
        }

        // Add the current message to the history
        const currentDate = new Date().toISOString().split('T')[0];
        const systemMessage = { role: "system", content: `Current date: ${currentDate}\n\n${instructions.getPrompt()}` };
        const userMessage = { role: "user", content: message };
        let messageChain = [
            systemMessage, ...history||[], userMessage
        ];

        const opts : LLMPredictionOpts = { structured: { type: "json", jsonSchema: instructions.getSchema() }, maxPredictedTokens: maxTokens  };

        // If contextWindowLength is provided, truncate the history
        const contextLength = parseInt(process.env.CONTEXT_SIZE||"") || contextWindowLength || 4096;
        let tokenCount = 0;
        for (let i = messageChain.length - 1; i >= 0; i--) {
            const messageTokens = await this.chatModel.unstable_countTokens(messageChain[i].content);
            tokenCount += messageTokens;

            if (tokenCount > contextLength) {
                Logger.info("CUTTING TOKENS");
                messageChain = messageChain.slice(i + 1);
                break;
            }
        }
        
        // Set the maxTokens parameter for the LLaMA model
        const prediction = this.chatModel.respond(messageChain, opts);
        const finalResult = await prediction;
        const resultBody = finalResult.content;
        return JSON5.parse(resultBody);
    }

    async generateStructured(userPost: ChatPost, instructions: StructuredOutputPrompt, history?: ChatPost[],  
        contextWindowLength?: number, maxTokens?: number): Promise<any> {
        if (!this.chatModel) {
            throw new Error("LLaMA model is not initialized.");
        }

        // Add the current message to the history
        const systemMessage = { role: "system", content: instructions.getPrompt() };
        const userMessage = { role: "user", content: userPost.message };
        let messageChain = [
            systemMessage, ...this.mapPosts(userPost, history), userMessage
        ];

        const opts : LLMPredictionOpts = { structured: { type: "json", jsonSchema: instructions.getSchema() }, maxPredictedTokens: maxTokens  };
        
        // Set the maxTokens parameter for the LLaMA model
        const prediction = this.chatModel.respond(messageChain, opts);
        const finalResult = await prediction;
        const resultBody = finalResult.content;
        return JSON5.parse(resultBody);
    }

    getEmbeddingModel() : IEmbeddingFunction {
        if (!this.embeddingModel) throw new Error("LMStudioService not initalized");
        return this.embeddingModel;
    }

    getChatModel() : LLMSpecificModel {
        if (!this.chatModel) throw new Error("LMStudioService not initalized");
        return this.chatModel;
    }
}
