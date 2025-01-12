import { IEmbeddingFunction } from "chromadb";
import { BaseLLMService } from "./BaseLLMService";
import type { LLamaModel, LLamaContext, LLamaEmbedder } from "node-llama-cpp";
import { ILLMService, LLMRequestParams, ModelRole } from "./ILLMService";
import { ModelMessageResponse, ModelResponse } from "../schemas/ModelResponse";
import { LLMCallLogger } from "./LLMLogger";
import Logger from "src/helpers/logger";
import JSON5 from "json5";
import { promises as fs } from 'fs';
import path from 'path';
import https from 'https';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';

class LlamaEmbedder implements IEmbeddingFunction {
    private embedder: LLamaEmbedder;

    constructor(embedder: LLamaEmbedder) {
        this.embedder = embedder;
    }

    async generate(texts: string[]): Promise<number[][]> {
        const embeddings: number[][] = [];
        for (const text of texts) {
            const embedding = await this.embedder.embed(text);
            embeddings.push(embedding);
        }
        return embeddings;
    }
}

export class LlamaCppService extends BaseLLMService {
    private model?: LLamaModel;
    private context?: LLamaContext;
    private embedder?: LlamaEmbedder;

    constructor() {
        super('llama-cpp');
    }

    private async downloadModel(repo: string, modelDir: string): Promise<string> {
        try {
            const modelName = 'nomic-embed-text-v1.5.Q4_K_M.gguf';
            const modelPath = path.join(modelDir, modelName);
            
            // Check if model already exists
            try {
                await fs.access(modelPath);
                Logger.info(`Model already exists at ${modelPath}`);
                return modelPath;
            } catch {
                // If not, download it
                Logger.info(`Downloading model ${repo}...`);
                await fs.mkdir(modelDir, { recursive: true });

                const url = `https://huggingface.co/${repo}/resolve/main/${modelName}`;
                const fileStream = createWriteStream(modelPath);
                
                Logger.info(`Downloading from ${url}`);
                await new Promise((resolve, reject) => {
                    https.get(url, response => {
                        if (response.statusCode !== 200) {
                            reject(new Error(`Failed to download model: ${response.statusCode} ${response.statusMessage}`));
                            return;
                        }
                        pipeline(response, fileStream)
                            .then(resolve)
                            .catch(reject);
                    }).on('error', reject);
                });

                Logger.info(`Model downloaded to ${modelPath}`);
                return modelPath;
            }
        } catch (error) {
            Logger.error(`Failed to download model ${repo}:`, error);
            throw error;
        }
    }

    async initializeEmbeddingModel(modelPath: string): Promise<void> {
        try {
            const nlc: typeof import("node-llama-cpp") = await Function('return import("node-llama-cpp")')();
            const {getLlama} = nlc;

            // Check if model exists
            try {
                await fs.access(modelPath);
            } catch {
                // If not, download it
                const modelDir = path.dirname(modelPath);
                await fs.mkdir(modelDir, { recursive: true });
                const downloadedPath = await this.downloadModel('nomic-ai/nomic-embed-text-v1.5', modelDir);
                modelPath = downloadedPath;
            }

            const llama = await getLlama();
            const model = await llama.loadModel({
                modelPath: modelPath
            });
            const context = await model.createEmbeddingContext();
            this.embedder = new LlamaEmbedder(model);
            Logger.info("Llama.cpp embedding model initialized");
        } catch (error) {
            Logger.error("Failed to initialize Llama.cpp embedding model:", error);
            throw error;
        }
    }

    async initializeChatModel(modelPath: string): Promise<void> {
        try {
            const nlc: typeof import("node-llama-cpp") = await Function('return import("node-llama-cpp")')();
            const {getLlama} = nlc;

            const llama = await getLlama();
            const model = await llama.loadModel({
                modelPath: modelPath
            });
            const context = await model.createContext();
            this.context = context;
            Logger.info("Llama.cpp chat model initialized");
        } catch (error) {
            Logger.error("Failed to initialize Llama.cpp chat model:", error);
            throw error;
        }
    }

    async countTokens(message: string): Promise<number> {
        if (!this.model) throw new Error("Llama.cpp model not initialized");
        return this.model.tokenize(message).length;
    }

    getEmbeddingModel(): IEmbeddingFunction {
        if (!this.embedder) throw new Error("Llama.cpp embedding model not initialized");
        return this.embedder;
    }

    async getAvailableModels(): Promise<string[]> {
        try {
            const nlc: typeof import("node-llama-cpp") = await Function('return import("node-llama-cpp")')();
            const {getLlama} = nlc;
            
            const llama = await getLlama();
            const modelDir = process.env.LLAMA_MODEL_DIR || './models';
            const modelFiles = await llama.listModels({ modelDir });
            return modelFiles.map(f => f.name);
        } catch (error) {
            await this.logger.logCall('getAvailableModels', {}, null, error);
            throw error;
        }
    }

    async sendLLMRequest<T extends ModelResponse = ModelMessageResponse>(
        params: LLMRequestParams
    ): Promise<T> {
        if (!this.context || !this.model) {
            throw new Error("Llama.cpp model not initialized");
        }

        let prompt = "";
        if (params.systemPrompt) {
            prompt += `System: ${params.systemPrompt}\n\n`;
        }

        // Convert message history to prompt
        for (const msg of params.messages) {
            const role = msg.role === ModelRole.USER ? "User" : "Assistant";
            prompt += `${role}: ${msg.content}\n\n`;
        }
        prompt += "Assistant:";

        try {
            const completion = await this.context.completion(prompt, {
                temperature: params.opts?.temperature ?? 0.7,
                maxTokens: params.opts?.maxPredictedTokens,
                topP: params.opts?.topP
            });

            const result = completion.trim();

            if (params.parseJSON) {
                return JSON5.parse(result) as T;
            }

            return result as T;
        } catch (error) {
            await this.logger.logCall('completion', params, null, error);
            throw error;
        }
    }
}
