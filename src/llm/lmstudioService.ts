// lmstudioService.ts

import { EmbeddingSpecificModel, LLMSpecificModel, LMStudioClient } from "@lmstudio/sdk";
import { IEmbeddingFunction } from "chromadb";
import Logger from "src/helpers/logger";
import JSON5 from "json5";
import { ChatPost } from "src/chat/chatClient";
import { ModelMessageResponse, ModelResponse } from "../schemas/ModelResponse";
import { LLMCallLogger } from "./LLMLogger";

import { LLMPredictionOpts, LLMRequestParams } from "./ILLMService";

interface LMStudioRequestParams extends LLMRequestParams {
    messages: ModelMessageHistory[];
    contextWindowLength?: number;
}

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

export interface ModelMessageHistory {
    role: ModelRole;
    content: string;
}

export interface MessageOpts {
    contextWindowLength?: number;
}

import { ILLMService, ModelRole, StructuredOutputPrompt } from "./ILLMService";

export default class LMStudioService implements ILLMService {
    private lmStudioClient: LMStudioClient;
    private embeddingModel?: IEmbeddingFunction;
    private chatModel?: LLMSpecificModel;
    private logger: LLMCallLogger;

    constructor() {
        this.lmStudioClient = new LMStudioClient({
            baseUrl: process.env.LMSTUDIO_BASEURL!
        });
        this.logger = new LLMCallLogger('lmstudio');
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

    async initializeChatModel(modelPath: string): Promise<void> {
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

    async generate<M extends ModelResponse>(instructions: string, userPost: ChatPost, history?: ChatPost[], opts?: MessageOpts): Promise<M> {
        const input = { instructions, userPost, history };
        const messages = [
            ...this.mapPosts(userPost, history),
            {
                role: ModelRole.USER,
                content: userPost.message
            }
        ];

        const result = await this.sendLLMRequest({ messages });
        await this.logger.logCall('generate', input, result);
        return result.response as M;
    }

    async sendMessageToLLM(message: string, history: any[], seedAssistant?: string, 
        contextWindowLength?: number, maxTokens?: number, schema?: object): Promise<string> {
        const input = { message, history, seedAssistant, contextWindowLength, maxTokens, schema };
        
        const messages = [...history];
        messages.push({ role: ModelRole.USER, content: message });

        if (seedAssistant) {
            messages.push({ role: ModelRole.ASSISTANT, content: seedAssistant });
        }

        const opts: LLMPredictionOpts = { maxPredictedTokens: maxTokens };
        if (schema) {
            opts.structured = { type: "json", jsonSchema: schema }; 
        }

        const resultBody = await this.sendLLMRequest({
            messages,
            opts,
            contextWindowLength
        });

        return resultBody.length > 0 ? ((seedAssistant || "") + resultBody.trim()) : "";
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
        const userMessage = { role: "user", content: message };
        let messageChain = [
            ...history||[], userMessage
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
        const input = { message, instructions: instructions.getPrompt(), history, contextWindowLength, maxTokens };
        try {
            const resultBody = finalResult.content;
            const output = JSON5.parse(resultBody);
            await this.logger.logCall('generateStructured', input, output);
            return output;
        } catch (error) {
            await this.logger.logCall('generateStructured', input, null, error);
            throw error;
        }
    }

    async generateStructured(userPost: ChatPost, instructions: StructuredOutputPrompt, history?: ChatPost[],  
        contextWindowLength?: number, maxTokens?: number): Promise<any> {
        const input = { userPost, instructions: instructions.getPrompt(), history, contextWindowLength, maxTokens };
        
        const messages = [
            ...this.mapPosts(userPost, history),
            {
                role: ModelRole.USER,
                content: userPost.message
            }
        ];

        const opts: LLMPredictionOpts = { 
            structured: { type: "json", jsonSchema: instructions.getSchema() }, 
            maxPredictedTokens: maxTokens 
        };

        try {
            const output = await this.sendLLMRequest({
                messages,
                systemPrompt: instructions.getPrompt(),
                opts,
                contextWindowLength,
                parseJSON: true
            });
            
            await this.logger.logCall('generateStructured', input, output);
            return output;
        } catch (error) {
            await this.logger.logCall('generateStructured', input, null, error);
            throw error;
        }
    }

    getEmbeddingModel() : IEmbeddingFunction {
        if (!this.embeddingModel) throw new Error("LMStudioService not initalized");
        return this.embeddingModel;
    }

    getChatModel() : LLMSpecificModel {
        if (!this.chatModel) throw new Error("LMStudioService not initalized");
        return this.chatModel;
    }

    private async sendLLMRequest<T extends ModelResponse = ModelMessageResponse>(params: LLMRequestParams): Promise<GenerateOutputParams<T>> {
        if (!this.chatModel) {
            throw new Error("LLaMA model is not initialized.");
        }

        let messageChain = [...params.messages];
        if (params.systemPrompt) {
            messageChain.unshift({ role: ModelRole.ASSISTANT, content: params.systemPrompt });
        }

        // Handle context window truncation if needed
        if (params.contextWindowLength) {
            const contextLength = parseInt(process.env.CONTEXT_SIZE || "") || params.contextWindowLength || 4096;
            let tokenCount = 0;
            for (let i = messageChain.length - 1; i >= 0; i--) {
                const messageTokens = await this.chatModel.unstable_countTokens(messageChain[i].content);
                tokenCount += messageTokens;

                if (tokenCount > contextLength) {
                    messageChain = messageChain.slice(i + 1);
                    break;
                }
            }
        }

        const prediction = await this.chatModel.respond(messageChain, params.opts || {});
        const resultBody = prediction.content;

        if (params.parseJSON) {
            return JSON5.parse(resultBody);
        }
        
        return resultBody;
    }
}
