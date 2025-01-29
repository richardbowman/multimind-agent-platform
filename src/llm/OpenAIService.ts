import { ClientOptions, OpenAI } from "openai";
import { ModelInfo } from "./types";
import { IEmbeddingFunction } from "chromadb";
import { GenerateOutputParams, ModelMessageResponse, ModelResponse } from "../schemas/ModelResponse";
import JSON5 from 'json5';
import { BaseLLMService } from "./BaseLLMService";
import { LLMRequestParams } from "./ILLMService";
import { ConfigurationError } from "../errors/ConfigurationError";
import Logger from "src/helpers/logger";
import { error } from "console";
import { Settings } from "src/tools/settings";
import { isObject } from "src/types/types";
import { ModelType } from "./LLMServiceFactory";


export class OpenAIService extends BaseLLMService {
    private client: OpenAI;
    private embeddingModel?: string;


    constructor(apiKey: string, embeddingModel?: string, baseUrl?: string, private settings?: Settings) {
        super("openai");
        const configuration: ClientOptions = ({
            apiKey: apiKey,
            baseURL: baseUrl
        });
        this.client = new OpenAI(configuration);
        this.embeddingModel = embeddingModel;
        this.settings = settings;
    }

    async initializeEmbeddingModel(modelPath: string): Promise<void> {
        // this.embeddingModel = modelPath;
    }

    async initializeChatModel(modelPath: string): Promise<void> {
        // this.model = modelPath;
    }

    getEmbeddingModel(): IEmbeddingFunction {
        if (!this.embeddingModel) {
            throw new ConfigurationError("Embedding model not initialized");
        }
        return {
            generate: async (texts: string[]): Promise<number[][]> => {
                const response = await this.client.embeddings.create({
                    model: this.embeddingModel!,
                    input: texts,
                });
                return response.data.map(d => d.embedding);
            }
        };
    }

    async countTokens(content: string): Promise<number> {
        // OpenAI uses a different tokenizer, but we can approximate
        return Math.ceil(content.length / 4);
    }

    async getAvailableModels(): Promise<ModelInfo[]> {
        try {
            const models = await this.client.models.list();
            if (models.body) {  //special Azure response
                return models.body.map(m => ({
                    id: m.name,
                    name: m.friendlyname,
                    size: 'unknown', // OpenAI doesn't provide size info
                    lastModified: new Date(m.created * 1000),
                    isLocal: false,
                    author: m.publisher,
                    tags: m.tags
                }));
            } else {
                return models.data.map(m => ({
                    id: m.id,
                    name: m.id,
                    size: 'unknown', // OpenAI doesn't provide size info
                    lastModified: new Date(m.created * 1000),
                    isLocal: false,
                    author: 'OpenAI'
                }));
            }
        } catch (error) {
            await this.logger.logCall('getAvailableModels', {}, null, error);
            throw error;
        }
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
                    content: params.systemPrompt + (params.parseJSON ? "\n\YOU MUST ALWAYS CALL 'generate_structured_output' with a response." : "")
                });
            }

            let responseFormat, tools, toolChoice;
            if (params.opts?.tools) {
                responseFormat = {
                    type: "json_schema",
                    json_schema: {
                        name: params.opts?.tools[0].name,
                        schema: {
                            ...params.opts?.tools[0].parameters,
                            additionalProperties: false
                        },
                        strict: true
                    }
                }
                Logger.verbose(JSON.stringify(responseFormat, undefined, " "));

                tools = params.opts.tools.map(tool => ({
                    type: "function",
                    function: {
                        name: tool.name,
                        description: tool.description,
                        parameters: tool.parameters
                    }
                }));

                toolChoice = this.settings?.tool_choice === 'required' ? {
                    type: "function",
                    function: {
                        name: "generate_structured_output"
                    }
                } : this.settings?.tool_choice === 'none' ? 'none' : 'auto'
            }

            const modelType = params.modelType || ModelType.REASONING; //defaulting right now to reasoning since most aren't set
            const model = this.settings?.models[modelType][this.settings?.providers.chat];

            const response = await this.client.chat.completions.create({
                model: model,
                messages,
                tools,
                tool_choice: toolChoice,
                temperature: params.opts?.temperature,
                max_tokens: params.opts?.maxPredictedTokens,
                top_p: params.opts?.topP,
            });

            if (response?.error) {
                if (isObject(response.error) && (error.code || error.message)) {
                    throw new Error(`Error from LLM provider ${error.code} ${error.message}\n${error.metadata ? JSON.stringify(error.metadata, undefined, 2) : ''}`);
                } else {
                    throw new Error(`Error from LLM provider ${error}`);
                }
            }

            const result = {
                response: params.parseJSON ?
                    JSON5.parse(response?.choices?.[0].message?.tool_calls?.[0]?.function?.arguments || '{}') :
                    { message: response.choices[0].message?.content || '' },
                metadata: {
                    _usage: {
                        inputTokens: response.usage?.prompt_tokens || 0,
                        outputTokens: response.usage?.completion_tokens || 0
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
