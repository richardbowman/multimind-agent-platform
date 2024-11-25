// lmstudioService.ts

import LMStudio from "@lmstudio/sdk";
import { IEmbeddingFunction } from "chromadb";
import Logger from "src/helpers/logger";

class MyEmbedder implements IEmbeddingFunction {
    private embeddingModel: LMStudio.EmbeddingSpecificModel;

    constructor(embeddingModel: LMStudio.EmbeddingSpecificModel) {
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

export default class LMStudioService {
    private lmStudioClient: LMStudio.LMStudioClient;
    private embeddingModel: IEmbeddingFunction;
    private chatModel: LMStudio.LLMSpecificModel;

    constructor() {
        this.lmStudioClient = new LMStudio.LMStudioClient({
            baseUrl: process.env.LMSTUDIO_BASEURL!
        });
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
                this.chatModel = await this.lmStudioClient.llm.load(modelPath);
                Logger.info("LLaMA model loaded.");
            }
        } catch (error) {
            Logger.error("Failed to initialize LLaMA model:", error);
            throw error;
        }
    }

    async sendMessageToLLM(message: string, history: any[], seedAssistant?: string, contextWindowLength?: number, maxTokens?: number): Promise<string> {
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

        // If contextWindowLength is provided, truncate the history
        // if (contextWindowLength !== undefined && contextWindowLength > 0) {
        //     let tokenCount = 0;
        //     for (let i = history.length - 1; i >= 0; i--) {
        //         const messageTokens = await this.chatModel.unstable_countTokens(history[i].content);
        //         tokenCount += messageTokens;

        //         if (tokenCount > contextWindowLength) {
        //             history = history.slice(i + 1);
        //             break;
        //         }
        //     }
        // }

        // Set the maxTokens parameter for the LLaMA model
        const prediction = this.chatModel.respond(history, { maxPredictedTokens: maxTokens });
        const finalResult = await prediction;
        const resultBody = finalResult.content;

        const inclSeed = (resultBody.length > 0 ? ((seedAssistant || "") + resultBody.trim()) : "");

        // Remove the last message from the history (user's message)
        return inclSeed;
    }

    getEmbeddingModel() {
        return this.embeddingModel;
    }

    getLlamaModel() {
        return this.chatModel;
    }
}