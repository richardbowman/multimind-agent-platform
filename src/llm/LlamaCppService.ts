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
import { getDataPath } from "src/helpers/paths";
import axios from 'axios';

interface HFModel {
    id: string;
    lastModified: string;
    tags: string[];
    downloads: number;
    likes: number;
    modelId: string;
    author: string;
    siblings: Array<{
        rfilename: string;
        size: number;
    }>;
}

class LlamaEmbedder implements IEmbeddingFunction {
    private context: LLamaContext;

    constructor(context: LLamaContext) {
        this.context = context;
    }

    async generate(texts: string[]): Promise<number[][]> {
        const embeddings: number[][] = [];
        for (const text of texts) {
            const embedding = await this.context.getEmbeddingFor(text);
            embeddings.push(Array.from(embedding)); // Convert Float32Array to number[]
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

    private async downloadModel(repo: string, modelName: string, modelDir: string): Promise<string> {
        try {
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

                // Construct URL from repo and model name
                const url = `https://huggingface.co/${repo}/resolve/main/${modelName}`;
                const fileStream = createWriteStream(modelPath);
                
                Logger.info(`Downloading from ${url}`);
                await new Promise((resolve, reject) => {
                    const request = https.get(url, response => {
                        // Handle redirects
                        if (response.statusCode === 302 && response.headers.location) {
                            const redirectUrl = response.headers.location;
                            Logger.info(`Redirecting to: ${redirectUrl}`);
                            https.get(redirectUrl, redirectResponse => {
                                if (redirectResponse.statusCode !== 200) {
                                    reject(new Error(`Failed to download model: ${redirectResponse.statusCode} ${redirectResponse.statusMessage}`));
                                    return;
                                }

                                let bytesDownloaded = 0;
                                redirectResponse.on('data', (chunk) => {
                                    bytesDownloaded += chunk.length;
                                });

                                pipeline(redirectResponse, fileStream)
                                    .then(() => {
                                        Logger.info(`Download complete. ${bytesDownloaded} bytes downloaded to ${modelPath}`);
                                        resolve(true);
                                    })
                                    .catch(reject);
                            }).on('error', reject);
                        } else if (response.statusCode === 200) {
                            let bytesDownloaded = 0;
                            response.on('data', (chunk) => {
                                bytesDownloaded += chunk.length;
                            });

                            pipeline(response, fileStream)
                                .then(() => {
                                    Logger.info(`Download complete. ${bytesDownloaded} bytes downloaded to ${modelPath}`);
                                    resolve(true);
                                })
                                .catch(reject);
                        } else {
                            reject(new Error(`Failed to download model: ${response.statusCode} ${response.statusMessage}`));
                        }
                    }).on('error', reject);
                });

                // Verify the downloaded file
                try {
                    const stats = await fs.stat(modelPath);
                    if (stats.size === 0) {
                        throw new Error('Downloaded file is empty');
                    }
                    
                    // Read first 4 bytes to check GGUF magic
                    const fd = await fs.open(modelPath, 'r');
                    const buffer = Buffer.alloc(4);
                    await fd.read(buffer, 0, 4, 0);
                    await fd.close();
                    
                    const magic = buffer.toString('utf8');
                    if (magic !== 'GGUF') {
                        throw new Error(`Invalid GGUF magic. Expected "GGUF" but got "${magic}"`);
                    }
                    
                    Logger.info(`Model verification successful: ${modelPath}`);
                } catch (verifyError) {
                    // Clean up invalid file
                    await fs.unlink(modelPath).catch(() => {});
                    throw new Error(`Model verification failed: ${verifyError.message}`);
                }
                return modelPath;
            }
        } catch (error) {
            Logger.error(`Failed to download model ${repo}:`, error);
            throw error;
        }
    }

    async initializeModel(modelName: string, repo: string, modelType: 'chat' | 'embedding'): Promise<void> {
        try {
            const nlc: typeof import("node-llama-cpp") = await Function('return import("node-llama-cpp")')();
            const {getLlama} = nlc;
            
            // Create models directory if it doesn't exist
            const modelDir = path.join(getDataPath(), "models");
            await fs.mkdir(modelDir, { recursive: true });
            
            const modelPath = path.join(modelDir, modelName);

            // Check if model exists
            try {
                await fs.access(modelPath);
            } catch {
                // If not, download it
                await this.downloadModel(repo, modelName, modelDir);
            }

            // Initialize the model
            const llama = await getLlama();
            const model = await llama.loadModel({
                modelPath: modelPath
            });

            if (modelType === 'chat') {
                const context = await model.createContext();
                this.context = context;
                Logger.info("Llama.cpp chat model initialized");
            } else if (modelType === 'embedding') {
                const context = await model.createEmbeddingContext();
                this.embedder = new LlamaEmbedder(context);
                Logger.info("Llama.cpp embedding model initialized");
            }

            const llama = await getLlama();
            const model = await llama.loadModel({
                modelPath: modelPath
            });
            const context = await model.createEmbeddingContext();
            this.embedder = new LlamaEmbedder(context);
            Logger.info("Llama.cpp embedding model initialized");
        } catch (error) {
            Logger.error("Failed to initialize Llama.cpp embedding model:", error);
            throw error;
        }
    }

    async initializeChatModel(modelName: string, repo: string): Promise<void> {
        return this.initializeModel(modelName, repo, 'chat');
    }

    async initializeEmbeddingModel(modelName: string, repo: string): Promise<void> {
        return this.initializeModel(modelName, repo, 'embedding');
    }

    async countTokens(message: string): Promise<number> {
        if (!this.model) throw new Error("Llama.cpp model not initialized");
        return this.model.tokenize(message).length;
    }

    getEmbeddingModel(): IEmbeddingFunction {
        if (!this.embedder) throw new Error("Llama.cpp embedding model not initialized");
        return this.embedder;
    }

    async searchModels(query: string, limit: number = 10): Promise<HFModel[]> {
        try {
            const response = await axios.get('https://huggingface.co/api/models', {
                params: {
                    search: query,
                    filter: 'gguf',
                    sort: 'downloads',
                    direction: -1,
                    limit: limit
                }
            });

            // Filter to only show models that have GGUF files
            const models = response.data.filter((model: HFModel) => 
                model.siblings.some(s => s.rfilename.endsWith('.gguf'))
            );

            return models.map((model: HFModel) => ({
                id: model.id,
                modelId: model.modelId,
                author: model.author,
                downloads: model.downloads,
                likes: model.likes,
                lastModified: model.lastModified,
                ggufFiles: model.siblings
                    .filter(s => s.rfilename.endsWith('.gguf'))
                    .map(s => ({
                        filename: s.rfilename,
                        size: (s.size / 1024 / 1024).toFixed(2) + ' MB'
                    }))
            }));
        } catch (error) {
            Logger.error('Failed to search models:', error);
            throw error;
        }
    }

    async getAvailableModels(): Promise<ModelInfo[]> {
        try {
            const nlc: typeof import("node-llama-cpp") = await Function('return import("node-llama-cpp")')();
            const {getLlama} = nlc;
            
            const llama = await getLlama();
            const modelDir = process.env.LLAMA_MODEL_DIR || path.join(getDataPath(), "models");
            
            // Get local models
            const localModels = [];
            try {
                const modelFiles = await llama.listModels({ modelDir });
                for (const file of modelFiles) {
                    try {
                        const stats = await fs.stat(file.path);
                        localModels.push({
                            name: file.name,
                            path: file.path,
                            size: (stats.size / 1024 / 1024).toFixed(2) + ' MB',
                            lastModified: stats.mtime
                        });
                    } catch (error) {
                        Logger.warn(`Could not get stats for model ${file.name}:`, error);
                    }
                }
            } catch (error) {
                Logger.warn('Could not list local models:', error);
            }

            // Get top remote models
            let remoteModels: HFModel[] = [];
            try {
                remoteModels = await this.searchModels('', 10); // Get top 10 most downloaded models
            } catch (error) {
                Logger.warn('Could not fetch remote models:', error);
            }

            // Combine and sort models
            const combinedModels = [
                ...localModels.map(model => ({
                    id: path.basename(model.name, '.gguf'),
                    name: model.name,
                    path: model.path,
                    size: model.size,
                    lastModified: model.lastModified,
                    isLocal: true
                })),
                ...remoteModels.flatMap(model => 
                    model.ggufFiles.map(file => ({
                        id: model.id,
                        name: file.filename,
                        size: file.size,
                        lastModified: new Date(model.lastModified),
                        isLocal: false,
                        author: model.author,
                        downloads: model.downloads,
                        likes: model.likes,
                        ggufFiles: model.ggufFiles
                    }))
                )
            ];

            // Sort by name, with local models first
            return combinedModels.sort((a, b) => {
                if (a.isLocal === b.isLocal) {
                    return a.name.localeCompare(b.name);
                }
                return a.isLocal ? -1 : 1;
            });
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
