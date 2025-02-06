import { BaseLLMService } from "./BaseLLMService";
import { type LlamaChatSession, type Llama, type LlamaContext, type LlamaModel, type LlamaOptions, LlamaChatSessionOptions, LlamaEmbeddingContext, ModelDownloaderOptions, ModelDownloader, GgufFileInfo } from "node-llama-cpp";
import { IEmbeddingFunction, EmbedderModelInfo, IEmbeddingService, ILLMService, LLMRequestParams, ModelRole, ModelSearchParams } from "./ILLMService";
import { ModelMessageResponse, ModelResponse } from "../schemas/ModelResponse";
import { LLMCallLogger } from "./LLMLogger";
import Logger from "src/helpers/logger";
import JSON5 from "json5";
import { promises as fs } from 'fs';
import path from 'path';
import https from 'https';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'stream/promises';
import { getDataPath } from "src/helpers/paths";
import axios from 'axios';
import { ModelInfo } from "./types";
import { ConfigurationError } from "src/errors/ConfigurationError";
import { sleep } from "src/utils/sleep";
import { ModelInfosPage } from "@anthropic-ai/sdk/resources";
import { app, BrowserWindow, ipcMain } from "electron";
import { Worker } from "node:worker_threads";

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

async function loadLlama(options?: LlamaOptions): Promise<Llama> {
    const nlc: typeof import("node-llama-cpp") = await Function('return import("node-llama-cpp")')();
    return nlc.getLlama(options);
}

async function loadLlamaChatSession(options: LlamaChatSessionOptions): Promise<LlamaChatSession> {
    const nlc: typeof import("node-llama-cpp") = await Function('return import("node-llama-cpp")')();
    return new nlc.LlamaChatSession(options);
}

async function createModelDownloader(options: ModelDownloaderOptions): Promise<ModelDownloader> {
    const nlc: typeof import("node-llama-cpp") = await Function('return import("node-llama-cpp")')();
    return nlc.createModelDownloader(options);
}

async function readGgufFileInfo(args: Parameters<typeof import("node-llama-cpp")["readGgufFileInfo"]>[0]): Promise<GgufFileInfo> {
    const nlc: typeof import("node-llama-cpp") = await Function('return import("node-llama-cpp")')();
    return nlc.readGgufFileInfo(args);
}

class LlamaEmbedder implements IEmbeddingFunction {
    private embeddingContext: LlamaEmbeddingContext;

    constructor(context: LlamaEmbeddingContext) {
        this.embeddingContext = context;
    }

    async generate(texts: string[]): Promise<number[][]> {
        const embeddings: number[][] = [];
        for (let i = 0; i < texts.length; i++) {
            if (texts.length > 5) Logger.progress(`Indexing documents (Chunk ${i + 1} of ${texts.length})`, (i + 1) / texts.length);
            try {
                const embedding = await this.embeddingContext.getEmbeddingFor(texts[i]);
                embeddings.push(Array.from(embedding.vector)); // Convert Float32Array to number[]
            } catch (e) {
                Logger.error(`Failed to generate embedding for text: ${texts[i]}`, e);
            }
        }
        return embeddings;
    }
}

export class LlamaCppService extends BaseLLMService implements IEmbeddingService {
    private llama?: Llama;
    private model?: LlamaModel;
    private context?: LlamaContext;
    private embedder?: LlamaEmbedder;
    private session?: LlamaChatSession;
    private embeddingContext: any;
    private gpuMode: string;

    constructor(gpuMode: string) {
        super('llama-cpp');

        this.gpuMode = gpuMode;

        const shutdown = async () => {
            await this.shutdown();
        }

        process.on('SIGTERM', shutdown);
        process.on('SIGINT', shutdown);
    }

    async shutdown(): Promise<void> {
        if (this.context) {
            await this.context.dispose();
            this.context = undefined;
        }

        if (this.embeddingContext) {
            await this.embeddingContext.dispose();
            this.embeddingContext = undefined;
        }

        if (this.llama) {
            await this.llama.dispose();
            this.llama = undefined;
        }
    }

    private getLlamaOptions(): LlamaOptions {
        return {
            gpu: this.gpuMode === 'CPU-only' ? false : "auto"
        };
    }

    private async downloadModel(owner: string, repo: string, modelName: string, modelDir: string): Promise<string> {
        const repoDir = path.join(modelDir, owner, repo);
        const modelPath = path.join(repoDir, modelName);

        try {
            await fs.access(modelPath);
            Logger.info(`Model already exists at ${modelPath}`);
            return modelPath;
        } catch {
            Logger.info(`Downloading model ${repo}...`);
            await fs.mkdir(repoDir, { recursive: true });

            const worker = new Worker(path.join(app.getAppPath(), 'dist', 'modelDownloader.worker.js'), {
                workerData: {
                    modelUri: `hf:${owner}/${repo}/${modelName}`,
                    dirPath: modelPath,
                    parallelDownloads: 1
                }
            });

            return new Promise((resolve, reject) => {
                worker.on('message', (message) => {
                    if (message.type === 'progress') {
                        const { totalSize, downloadedSize } = message;
                        const totalKB = Math.floor(totalSize / 1024);
                        const currentKB = Math.floor(downloadedSize / 1024);
                        const percent = totalSize > 0 ? (downloadedSize / totalSize) : 0;
                        const percentFormatted = percent > 0 ? ` (${(percent * 100).toFixed(1)}%)` : "";
                        Logger.progress(`Downloading ${currentKB}/${totalKB} KB${percentFormatted} of ${modelName}`, percent);
                    } else if (message.type === 'complete') {
                        resolve(message.entrypointFilePath);
                        worker.terminate();
                    } else if (message.type === 'error') {
                        reject(new Error(message.error));
                        worker.terminate();
                    }
                });

                worker.on('error', (error) => {
                    reject(error);
                    worker.terminate();
                });

                worker.on('exit', (code) => {
                    if (code !== 0) {
                        reject(new Error(`Worker stopped with exit code ${code}`));
                    }
                });
            });
        }
    }

    async initializeModel(modelId: string, modelType: 'chat' | 'embedding'): Promise<void> {
        try {
            if (!this.llama) {
                const options = this.getLlamaOptions();
                this.llama = await loadLlama(options);
            }

            // Create models directory if it doesn't exist
            const modelDir = path.join(getDataPath(), "models");
            await fs.mkdir(modelDir, { recursive: true });

            // For local models, modelId is just the filename
            const isLocal = !modelId.includes('/');
            let modelPath = isLocal
                ? path.join(modelDir, modelId) // Local models go directly in modelDir
                : path.join(modelDir, ...modelId.split('/')); // Remote models use repo subdirs

            // Check if model exists
            try {
                await fs.access(modelPath);
                if (!isLocal) {
                    const metadata = JSON.parse((await fs.readFile(path.join(modelPath, "model.json"))).toString());
                    modelPath = path.join(modelPath, metadata.entrypointFilename);
                }
            } catch {
                if (!isLocal) {
                    // If not local and not found, download it
                    const [owner, repo, modelName] = modelId.split('/');
                    modelPath = await this.downloadModel(owner, repo, modelName, modelDir);
                } else {
                    throw new Error(`Local model ${modelId} not found`);
                }
            }

            const model = await this.llama.loadModel({
                modelPath: modelPath
            });

            if (modelType === 'chat') {
                if (this.context) {
                    await this.context.dispose();
                }
                if (this.model) {
                    await this.model.dispose();
                }
                const context = await model.createContext();
                this.context = context;
                this.model = model;
                this.session = await loadLlamaChatSession({
                    contextSequence: this.context.getSequence()
                });
                Logger.info("Llama.cpp chat model initialized");
            } else if (modelType === 'embedding') {
                if (this.embeddingContext) {
                    await this.embeddingContext.dispose();
                }
                this.embeddingContext = await model.createEmbeddingContext();
                this.embedder = new LlamaEmbedder(this.embeddingContext);
                Logger.info("Llama.cpp embedding model initialized");
            }

        } catch (error) {
            Logger.error(`Failed to initialize Llama.cpp {$modelType} model`, error);
            throw new ConfigurationError(`Failed to initialize Llama.cpp {$modelType} model. See logs.`);
        }
    }

    async initializeChatModel(modelId: string): Promise<void> {
        try {
            return this.initializeModel(modelId, 'chat');
        } catch (error) {
            throw error;
        }
    }

    async initializeEmbeddingModel(modelId: string): Promise<void> {
        try {
            return this.initializeModel(modelId, 'embedding');
        } catch (error) {
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

    async searchModels(query: string, limit: number = 10, pipelineTag?: string): Promise<HFModel[]> {
        try {
            const params: Record<string, any> = {
                search: query,
                sort: 'downloads',
                full: "full",
                direction: -1,
                limit: limit
            };

            if (pipelineTag) {
                params.pipeline_tag = pipelineTag;
            }
            params.filter = 'gguf';

            const response = await axios.get('https://huggingface.co/api/models', {
                params
            });

            // Filter based on pipeline tag or GGUF files
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
                pipelineTag: model.pipeline_tag,
                supportedTasks: model.tags?.filter(t => t.startsWith('task:')) || [],
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

    async getAvailableEmbedders(searchParams?: ModelSearchParams): Promise<EmbedderModelInfo[]> {
        try {
            // Search for embedding models
            const embeddingModels = await this.searchModels(searchParams?.textFilter || "", 10, 'sentence-similarity');

            return embeddingModels.flatMap(model =>
                model.ggufFiles.map(file => ({
                    id: `${model.id}/${file.filename}`,
                    name: file.filename,
                    size: file.size,
                    lastModified: new Date(model.lastModified),
                    isLocal: false,
                    author: model.author,
                    downloads: model.downloads,
                    likes: model.likes,
                    ggufFiles: model.ggufFiles,
                    repo: model.id
                }))
            );
        } catch (error) {
            await this.logger.logCall('getAvailableEmbedders', {}, null, error);
            throw error;
        }
    }

    async getAvailableModels(searchParams?: ModelSearchParams): Promise<ModelInfo[]> {
        try {
            const modelDir = process.env.LLAMA_MODEL_DIR || path.join(getDataPath(), "models");

            // Get local models
            const localModels = [];
            try {
                // Read model directory
                const files = await fs.readdir(modelDir);

                // Filter for GGUF files and get their stats
                for (const fileName of files) {
                    if (fileName.endsWith('.gguf')) {
                        try {
                            const filePath = path.join(modelDir, fileName);
                            const stats = await fs.stat(filePath);

                            // Verify it's a valid GGUF file
                            const fd = await fs.open(filePath, 'r');
                            const buffer = Buffer.alloc(4);
                            await fd.read(buffer, 0, 4, 0);
                            await fd.close();

                            const magic = buffer.toString('utf8');
                            if (magic !== 'GGUF') {
                                Logger.warn(`Invalid GGUF file: ${fileName}`);
                                continue;
                            }

                            // Create a more descriptive ID
                            const baseName = fileName.replace(/\.gguf$/i, '');
                            const modelId = `local/${baseName}`;

                            localModels.push({
                                id: modelId,
                                name: baseName,
                                path: filePath,
                                size: (stats.size / 1024 / 1024).toFixed(2) + ' MB',
                                lastModified: stats.mtime,
                                isLocal: true,
                                author: 'Local',
                                description: 'Locally uploaded model',
                                ggufFiles: [{
                                    filename: fileName,
                                    size: (stats.size / 1024 / 1024).toFixed(2) + ' MB'
                                }]
                            });
                        } catch (error) {
                            Logger.warn(`Could not process model ${fileName}:`, error);
                        }
                    }
                }
            } catch (error) {
                Logger.warn('Could not list local models:', error);
            }

            // Get top remote models
            let remoteModels: HFModel[] = [];
            try {
                remoteModels = await this.searchModels(searchParams?.textFilter || "", 10); // Get top 10 most downloaded models
            } catch (error) {
                Logger.warn('Could not fetch remote models:', error);
            }

            // Combine models with clear local/remote distinction
            const combinedModels = [
                ...localModels.map(model => ({
                    ...model,
                    type: 'local',
                    label: 'Local Model'
                })),
                ...remoteModels.flatMap(model =>
                    model.ggufFiles.map(file => ({
                        id: `${model.id}/${file.filename}`,
                        name: file.filename,
                        size: file.size,
                        lastModified: new Date(model.lastModified),
                        isLocal: false,
                        type: 'remote',
                        label: 'Remote Model',
                        author: model.author,
                        downloads: model.downloads,
                        likes: model.likes,
                        ggufFiles: model.ggufFiles,
                        repo: model.id,
                        description: model.description || `Model from ${model.author}`
                    }))
                )
            ];

            // Sort with local models first, then by name
            return combinedModels.sort((a, b) => {
                if (a.isLocal === b.isLocal) {
                    return a.name.localeCompare(b.name);
                }
                return a.isLocal ? -1 : 1;
            }).map(model => ({
                ...model,
                // Add a display name that shows the source
                displayName: model.isLocal ? `Local: ${model.name}` : `Remote: ${model.name}`
            }));
        } catch (error) {
            await this.logger.logCall('getAvailableModels', {}, null, error);
            throw error;
        }
    }

    async sendLLMRequest<T extends ModelResponse = ModelMessageResponse>(
        params: LLMRequestParams
    ): Promise<T> {
        if (!this.context || !this.model || !this.llama || !this.session) {
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
            this.session.resetChatHistory();

            let grammar;
            if (params.parseJSON && params.opts?.tools?.[0]?.parameters) {
                // Create grammar from JSON schema if structured output is requested
                grammar = await this.llama.createGrammarForJsonSchema(params.opts.tools[0].parameters);
            }

            const completion = await this.session.prompt(prompt, {
                temperature: params.opts?.temperature ?? 0.7,
                maxTokens: params.opts?.maxPredictedTokens,
                topP: params.opts?.topP,
                grammar
            });

            const result = completion.trim();

            if (params.parseJSON && grammar) {
                try {
                    const parsed = grammar.parse(result);
                    return parsed as T;
                } catch (error) {
                    Logger.error("Failed to parse structured output:", error);
                    throw new Error(`Failed to parse structured output: ${error.message}`);
                }
            }

            return { message: result } as T;
        } catch (error) {
            await this.logger.logCall('completion', params, null, error);
            throw error;
        }
    }
}
