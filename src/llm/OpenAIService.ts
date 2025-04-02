import { ClientOptions, OpenAI } from "openai";
import { ModelInfo } from "./types";
import { GenerateOutputParams, ModelMessageResponse, ModelResponse } from "../schemas/ModelResponse";
import { ModelSearchParams, VisionContent } from "./ILLMService";
import JSON5 from 'json5';
import { BaseLLMService } from "./BaseLLMService";
import { IEmbeddingFunction, LLMRequestParams } from "./ILLMService";
import { ConfigurationError } from "../errors/ConfigurationError";
import Logger from "src/helpers/logger";
import { Settings } from "src/tools/settings";
import { LLMProvider } from "./types/LLMProvider";


export class OpenAIService extends BaseLLMService {
    private client: OpenAI;
    private embeddingModel?: string;

    async shutdown(): Promise<void> {
        // Clean up any OpenAI resources if needed
        this.client = null as unknown as OpenAI;
    }

    private async bufferToBase64(buffer: Buffer): Promise<string> {
        return `data:image/jpeg;base64,${buffer.toString('base64')}`;
    }

    private async processVisionContent(content: VisionContent | Buffer): Promise<string> {
        if (Buffer.isBuffer(content)) {
            return this.bufferToBase64(content);
        }
        return content.image_url.url;
    }


    constructor(private settings: Settings, apiKey: string, baseURL?: string, private serviceName: LLMProvider = LLMProvider.OPENAI) {
        super(serviceName, settings);
        const configuration: ClientOptions = ({
            apiKey,
            baseURL
        });
        this.client = new OpenAI(configuration);
    }

    providerType() : LLMProvider {
        return this.serviceName;
    }

    async initializeEmbeddingModel(modelPath: string): Promise<void> {
        this.embeddingModel = modelPath;
    }

    async initializeChatModel(modelPath: string): Promise<void> {
        // this.model = modelPath;
    }

    getEmbeddingModel(searchParams?: ModelSearchParams): IEmbeddingFunction {
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

    async getAvailableModels(searchParams?: ModelSearchParams): Promise<ModelInfo[]> {
        try {
            const models = await this.client.models.list();
            let modelList = models.body?.length && models.body.length > 0 ?  //special Azure response
                models.body.map(m => ({
                    id: m.name,
                    name: m.friendly_name,
                    size: 'unknown', // OpenAI doesn't provide size info
                    lastModified: new Date(m.created * 1000),
                    isLocal: false,
                    author: m.publisher,
                    tags: m.tags
                })) :
                models.data.map(m => ({
                    id: m.id,
                    name: m.id,
                    size: 'unknown', // OpenAI doesn't provide size info
                    lastModified: new Date(m.created * 1000),
                    isLocal: false,
                    author: 'OpenAI'
                }));

            if (searchParams?.textFilter) {
                const filter = searchParams.textFilter.toLowerCase();
                modelList = modelList.filter(m => 
                    m.id.toLowerCase().includes(filter) || 
                    m.name.toLowerCase().includes(filter)
                );
            }

            return modelList;
        } catch (error) {
            await this.logger.logCall('getAvailableModels', {}, null, error);
            throw error;
        }
    }

    async sendVisionRequest<T extends ModelResponse = ModelMessageResponse>(
        params: LLMRequestParams
    ): Promise<GenerateOutputParams<T>> {
        try {
            const messages = await Promise.all(params.messages.map(async m => ({
                role: m.role,
                content: Array.isArray(m.content) ?
                    await Promise.all(m.content.map(async c => 
                        typeof c === 'string' ? c : this.processVisionContent(c)
                    )) :
                    typeof m.content === 'string' ? m.content : await this.processVisionContent(m.content)
            })));

            if (params.systemPrompt) {
                messages.unshift({
                    role: "system",
                    content: params.systemPrompt
                });
            }

            const model = this.selectModel(params.modelType);

            const startTime = Date.now();
            const response = await this.client.chat.completions.create({
                model: model,
                messages,
                temperature: params.opts?.temperature,
                max_tokens: params.opts?.maxPredictedTokens,
                top_p: params.opts?.topP,
            });

            const result: GenerateOutputParams<T> = {
                response: { message: response.choices[0].message?.content || '' } as T,
                metadata: {
                    _usage: {
                        inputTokens: response.usage?.prompt_tokens || 0,
                        outputTokens: response.usage?.completion_tokens || 0
                    }
                }
            };
            const durationMs = Date.now() - startTime;

            await this.logger.logCall('sendVisionRequest', {
                messages: params.messages,
                systemPrompt: params.systemPrompt,
                opts: params.opts
            }, result.response, undefined, durationMs);

            return result;
        } catch (error) {
            await this.logger.logCall('sendVisionRequest', {
                messages: params.messages,
                systemPrompt: params.systemPrompt,
                opts: params.opts
            }, null, error);
            throw error;
        }
    }

    async sendLLMRequest<T extends ModelResponse = ModelMessageResponse>(params: LLMRequestParams): Promise<GenerateOutputParams<T>> {
        let response;
        try {
            const messages = params.messages.map(m => ({
                role: m.role,
                content: m.content
            }));

            if (params.systemPrompt) {
                messages.unshift({
                    role: "system",
                    content: params.systemPrompt + (params.parseJSON ? "\n\nYOU MUST ALWAYS CALL 'generate_structured_output' with a response." : "")
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
                } : this.settings?.tool_choice === 'none' ? undefined : 'auto'
            }

            const model = this.selectModel(params.modelType);


            const startTime = Date.now();
            response = await this.client.chat.completions.create({
                model: model,
                messages,
                tools,
                tool_choice: toolChoice,
                temperature: params.opts?.temperature,
                max_tokens: params.opts?.maxPredictedTokens,
                top_p: params.opts?.topP,
            });

            if (response?.error) {
                const err = response.error as { code?: string; message?: string; metadata?: any };
                if (err.code || err.message) {
                    throw new Error(`Error from LLM provider ${err.code} ${err.message}\n${err.metadata ? JSON.stringify(err.metadata, undefined, 2) : ''}`);
                } else {
                    throw new Error(`Error from LLM provider ${JSON.stringify(err)}`);
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
                    },
                    _message: params.parseJSON ? response.choices[0].message?.content: undefined
                }
            };
            const durationMs = Date.now() - startTime;

            await this.logger.logCall('sendLLMRequest', {
                messages: params.messages,
                systemPrompt: params.systemPrompt,
                opts: params.opts
            }, result.response, undefined, durationMs, params.context);

            return result;
        } catch (error) {
            await this.logger.logCall('sendLLMRequest', {
                messages: params.messages,
                systemPrompt: params.systemPrompt,
                opts: params.opts
            }, response||"", error);
            throw error;
        }
    }
}
