import { ILLMService, LLMRequestParams } from "./ILLMService";
import { GenerateOutputParams, ModelMessageResponse, ModelResponse } from "../schemas/ModelResponse";
import Logger from "src/helpers/logger";
import { AsyncQueue } from "../helpers/asyncQueue";
import { BaseLLMService } from "./BaseLLMService";
import JSON5 from 'json5';
import Anthropic from '@anthropic-ai/sdk';
import { ModelType } from "./types/ModelType";
import { Settings } from "src/tools/settings";
import { LLMProvider } from "./types/LLMProvider";

export class AnthropicService extends BaseLLMService {
    private client: Anthropic;
    private queue: AsyncQueue = new AsyncQueue();
    private embeddingService?: ILLMService;

    constructor(apiKey: string, private settings: Settings, embeddingService?: ILLMService) {
        super(LLMProvider.ANTHROPIC);
        this.client = new Anthropic({
            apiKey: apiKey
        });
        this.embeddingService = embeddingService;
    }

    async shutdown(): Promise<void> {
        return;
    }

    providerType(): string {
        return LLMProvider.ANTHROPIC;
    }

    async initializeChatModel(modelPath: string): Promise<void> {
        Logger.info(`Anthropic service ready using model: ${modelPath}`);
    }

    private async makeAnthropicRequest(messages: any[], modelType?: ModelType, systemPrompt?: string, opts: any = {}) {
        const tools = opts.tools?.map(tool => ({
            name: tool.name,
            description: tool.description,
            input_schema: {
                type: "object",
                properties: tool.parameters.properties,
                required: tool.parameters.required || []
            }
        }));

        try {
            const model = this.selectModel(modelType);

            const response = await this.client.messages.create({
                model,
                messages: messages,
                system: systemPrompt || "",
                max_tokens: opts.maxTokens || 2048,
                temperature: opts.temperature,
                top_p: opts.topP,
                ...(tools && { tools })
            });

            return response;
        } catch (error: any) {
            Logger.error("Anthropic API error:", error);
            throw error;
        }
    }

    async sendLLMRequest<T extends ModelResponse = ModelMessageResponse>(
        params: LLMRequestParams
    ): Promise<GenerateOutputParams<T>> {
        return this.queue.enqueue(async () => {
            const messages = params.messages.map(msg => ({
                role: msg.role === 'assistant' ? 'assistant' : 'user',
                content: msg.content
            }));

            try {
                const response = await this.makeAnthropicRequest(
                    messages,
                    params.modelType,
                    params.systemPrompt,
                    params.opts
                );

                let content: any;
                
                // Handle both text and tool_use responses
                const responses = response.content;
                const textResponse = responses.find(r => r.type === 'text');
                const toolResponse = responses.find(r => r.type === 'tool_use');
                
                if (toolResponse) {
                    content = {
                        // message: textResponse?.text, we can't do this it throws off validators
                        ...toolResponse.input as object
                    };
                } else if (params.parseJSON && textResponse) {
                    try {
                        const jsonMatch = textResponse.text.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || [null, textResponse.text];
                        const jsonContent = jsonMatch[1].trim();
                        content = JSON5.parse(jsonContent);
                    } catch (e) {
                        Logger.error("Failed to parse JSON response:", e);
                        Logger.error("Raw response:", textResponse.text);
                        throw e;
                    }
                } else if (textResponse) {
                    content = { message: textResponse.text };
                } else {
                    throw new Error("No valid response content found");
                }

                const result = {
                    response: content as T,
                    metadata: {
                        _usage: {
                            inputTokens: response.usage?.input_tokens || 0,
                            outputTokens: response.usage?.output_tokens || 0
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
                Logger.error("Error in Anthropic API call:", error);
                throw error;
            }
        });
    }

    async countTokens(content: string): Promise<number> {
        // Anthropic doesn't provide a token counting endpoint
        // This is a rough estimate based on GPT tokenization rules
        return Math.ceil(content.length / 4);
    }

    async getAvailableModels(): Promise<ModelInfo[]> {
        try {
            // Get the list of available models from Anthropic's API
            const response = await this.client.models.list();
            
            // Map the API response to our ModelInfo interface
            return response.data.map(model => ({
                id: model.id,
                name: model.name || model.id,
                size: model.size || 'Unknown',
                lastModified: new Date(),
                isLocal: false,
                author: 'Anthropic',
                downloads: 0
            }));
        } catch (error) {
            Logger.error("Failed to fetch available models from Anthropic:", error);
            throw error;
        }
    }
}
