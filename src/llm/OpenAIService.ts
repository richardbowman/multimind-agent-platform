import { Configuration, OpenAIApi } from "openai";
import { IEmbeddingFunction } from "chromadb";
import { ModelMessageResponse, ModelResponse } from "../schemas/ModelResponse";
import { LLMCallLogger } from "./LLMLogger";
import { BaseLLMService } from "./BaseLLMService";
import { LLMRequestParams, GenerateOutputParams } from "./ILLMService";
import { ConfigurationError } from "../errors/ConfigurationError";

export class OpenAIService extends BaseLLMService {
    private client: OpenAIApi;
    private model: string;
    private embeddingModel?: string;
    private embeddingService?: IEmbeddingFunction;

    private baseUrl: string = "https://api.openai.com/v1";

    constructor(apiKey: string, model: string, embeddingModel?: string) {
        super("openai");
        const configuration = new Configuration({
            apiKey: apiKey,
            basePath: this.baseUrl
        });
        this.client = new OpenAIApi(configuration);
        this.model = model;
        this.embeddingModel = embeddingModel;
    }

    setBaseUrl(url: string): this {
        this.baseUrl = url;
        const configuration = new Configuration({
            apiKey: this.client.configuration.apiKey,
            basePath: this.baseUrl
        });
        this.client = new OpenAIApi(configuration);
        return this;
    }

    async initializeEmbeddingModel(modelPath: string): Promise<void> {
        this.embeddingModel = modelPath;
    }

    async initializeChatModel(modelPath: string): Promise<void> {
        this.model = modelPath;
    }

    getEmbeddingModel(): IEmbeddingFunction {
        if (!this.embeddingModel) {
            throw new ConfigurationError("Embedding model not initialized");
        }
        return {
            generate: async (texts: string[]): Promise<number[][]> => {
                const response = await this.client.createEmbedding({
                    model: this.embeddingModel!,
                    input: texts,
                });
                return response.data.data.map(d => d.embedding);
            }
        };
    }

    async countTokens(content: string): Promise<number> {
        // OpenAI uses a different tokenizer, but we can approximate
        return Math.ceil(content.length / 4);
    }

    async sendLLMRequest<T extends ModelResponse = ModelMessageResponse>(
        params: LLMRequestParams
    ): Promise<GenerateOutputParams<T>> {
        try {
            const messages = params.messages.map(m => ({
                role: m.role,
                content: m.content
            }));

            if (params.systemPrompt) {
                messages.unshift({
                    role: "system",
                    content: params.systemPrompt
                });
            }

            const response = await this.client.createChatCompletion({
                model: this.model,
                messages,
                temperature: params.opts?.temperature,
                max_tokens: params.opts?.maxPredictedTokens,
                top_p: params.opts?.topP,
            });

            const result = {
                response: params.parseJSON ? 
                    JSON.parse(response.data.choices[0].message?.content || '{}') : 
                    { message: response.data.choices[0].message?.content || '' },
                metadata: {
                    _usage: {
                        inputTokens: response.data.usage?.prompt_tokens || 0,
                        outputTokens: response.data.usage?.completion_tokens || 0
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
