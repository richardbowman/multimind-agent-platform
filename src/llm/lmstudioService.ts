// lmstudioService.ts

import { EmbeddingSpecificModel, LLMSpecificModel, LMStudioClient } from "@lmstudio/sdk";
import { IEmbeddingFunction } from "chromadb";
import Logger from "src/helpers/logger";
import JSON5 from "json5";
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

import { BaseLLMService } from "./BaseLLMService";
import { ConfigurationError } from "../errors/ConfigurationError";

export default class LMStudioService extends BaseLLMService {
    private lmStudioClient: LMStudioClient;
    private embeddingModel?: IEmbeddingFunction;
    private chatModel?: LLMSpecificModel;

    constructor() {
        super("lmstudio");
        this.lmStudioClient = new LMStudioClient({
            baseUrl: process.env.LMSTUDIO_BASEURL!
        });
    }

    countTokens(message: string): Promise<number> {
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
        const loaded = await this.lmStudioClient.llm.listLoaded();
        const availableModels = loaded.map(model => model.identifier);

        if (!availableModels.includes(modelPath)) {
            const configError = new ConfigurationError(
                `LLM model "${modelPath}" not found. Available models:\n${availableModels.map(m => `- ${m}`).join('\n')}`
            );
            Logger.error("Failed to initialize LLaMA model:", configError);
            throw configError;
        }

        try {
            this.chatModel = await this.lmStudioClient.llm.get(modelPath);
            Logger.info("Connected to existing LLaMA model.");
        } catch (error) {
            Logger.error("Failed to connect to LLaMA model:", error);
            throw error;
        }
    }




    async sendStructuredRequest(
        message: string,
        instructions: StructuredOutputPrompt,
        history?: any[],
        contextWindowLength?: number,
        maxTokens?: number
    ): Promise<any> {
        if (!this.chatModel) {
            throw new Error("LLaMA model is not initialized.");
        }

        // Add the current message to the history
        const userMessage = { role: "user", content: message };
        let messageChain = [
            ...history || [], userMessage
        ];

        const opts: LLMPredictionOpts = { structured: { type: "json", jsonSchema: instructions.getSchema() }, maxPredictedTokens: maxTokens };

        // If contextWindowLength is provided, truncate the history
        const contextLength = parseInt(process.env.CONTEXT_SIZE || "") || contextWindowLength || 4096;
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
        const input = {
            message,
            instructions: instructions.getPrompt(),
            history,
            contextWindowLength,
            maxTokens
        };

        try {
            const prediction = await this.chatModel.respond(messageChain, opts);
            const resultBody = prediction.content;
            const output = JSON5.parse(resultBody);

            const result = {
                response: output,
                metadata: {
                    _usage: {
                        inputTokens: await this.countTokens(messageChain.map(m => m.content).join('')),
                        outputTokens: await this.countTokens(resultBody)
                    }
                }
            };

            await this.logger.logCall('sendStructuredRequest', input, result.response);
            return result;
        } catch (error) {
            await this.logger.logCall('sendStructuredRequest', input, null, error);
            throw error;
        }
    }


    getEmbeddingModel(): IEmbeddingFunction {
        if (!this.embeddingModel) throw new Error("LMStudioService not initalized");
        return this.embeddingModel;
    }

    getChatModel(): LLMSpecificModel {
        if (!this.chatModel) throw new Error("LMStudioService not initalized");
        return this.chatModel;
    }

    async sendLLMRequest<T extends ModelResponse = ModelMessageResponse>(params: LLMRequestParams): Promise<GenerateOutputParams<T>> {
        if (!this.chatModel) {
            throw new Error("LLaMA model is not initialized.");
        }

        let messageChain = [...params.messages];
        if (params.systemPrompt) {
            messageChain.unshift({ role: ModelRole.ASSISTANT, content: params.systemPrompt });
        }

        // Handle context window truncation if needed
        if (params.opts?.contextWindowLength) {
            const contextLength = parseInt(process.env.CONTEXT_SIZE || "") || params.opts.contextWindowLength || 4096;
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

        try {
            const toolOpts: Partial<LLMPredictionOpts> = {};
            if (params.opts?.tools?.length == 1) {
                toolOpts.structured = {
                    type: "json",
                    jsonSchema: params.opts.tools[0].parameters
                }
            } else if (params.opts?.tools && params.opts?.tools?.length > 1) {
                toolOpts.tools = {
                    type: "toolArray",
                    tools: params.opts?.tools?.map(t => ({
                        type: "function",
                        function: t
                    }))
                };
            }

            const prediction = await this.chatModel.respond(messageChain, {
                maxPredictedTokens: params.opts?.maxPredictedTokens,
                temperature: params.opts?.temperature,
                ...toolOpts
            });

            const resultBody = prediction.content;

            const result = {
                response: params.parseJSON ? JSON5.parse(resultBody) : { message : resultBody },
                metadata: {
                    _usage: {
                        inputTokens: await this.countTokens(messageChain.map(m => m.content).join('')),
                        outputTokens: await this.countTokens(resultBody)
                    }
                }
            };

            await this.logger.logCall('sendLLMRequest', {
                messages: params.messages,
                systemPrompt: params.systemPrompt,
                opts: params.opts
            }, result.response);

            return result;
        } catch (error) {
            await this.logger.logCall('sendLLMRequest', {
                messages: params.messages,
                systemPrompt: params.systemPrompt,
                opts: params.opts
            }, null, error);
            throw error;
        }
    }
}
