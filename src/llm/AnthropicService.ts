import { ILLMService, LLMRequestParams, ModelRole, StructuredOutputPrompt } from "./ILLMService";
import { GenerateOutputParams, ModelMessageResponse, ModelResponse } from "../schemas/ModelResponse";
import { ChatPost } from "src/chat/chatClient";
import { IEmbeddingFunction } from "chromadb";
import Logger from "src/helpers/logger";
import { LLMCallLogger } from "./LLMLogger";
import { AsyncQueue } from "../helpers/asyncQueue";
import { BaseLLMService } from "./BaseLLMService";
import { ANTHROPIC_API_KEY, ANTHROPIC_MODEL, ANTHROPIC_MAX_TOKENS_PER_MINUTE, ANTHROPIC_DEFAULT_DELAY_MS, ANTHROPIC_WINDOW_SIZE_MS } from "../helpers/config";
import JSON5 from 'json5';

export class AnthropicService extends BaseLLMService {
    private apiKey: string;
    private model: string;
    private logger: LLMCallLogger;
    private queue: AsyncQueue = new AsyncQueue();
    private embeddingService?: ILLMService;

    constructor(apiKey: string = ANTHROPIC_API_KEY, model: string = ANTHROPIC_MODEL, embeddingService?: ILLMService) {
        super();
        this.apiKey = apiKey;
        this.model = model;
        this.embeddingService = embeddingService;
        this.logger = new LLMCallLogger('anthropic');
    }

    async initializeEmbeddingModel(modelPath: string): Promise<void> {
        if (this.embeddingService) {
            await this.embeddingService.initializeEmbeddingModel(modelPath);
            Logger.info("Using external embedding service for Anthropic");
        } else {
            Logger.warn("No embedding service configured for Anthropic - embeddings will not be available");
        }
    }

    async initializeChatModel(modelPath: string): Promise<void> {
        Logger.info(`Anthropic service ready using model: ${this.model}`);
    }

    getEmbeddingModel(): IEmbeddingFunction {
        if (!this.embeddingService) {
            throw new Error("No embedding service configured for Anthropic");
        }
        return this.embeddingService.getEmbeddingModel();
    }

    private async makeAnthropicRequest(messages: any[], systemPrompt?: string, opts: any = {}) {
        let finalSystemPrompt = systemPrompt || "";
        const tools = opts.tools?.map(tool => ({
            function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters
            }
        }));

        const messagesWithBrace = [...messages];

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': this.apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: this.model,
                messages: messages,
                system: finalSystemPrompt,
                max_tokens: opts.maxTokens||2048,
                temperature: opts.temperature,
                top_p: opts.topP,
                ...(tools && { tools })
            })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Anthropic API error: ${error}`);
        }

        return await response.json();
    }

    async sendLLMRequest<T extends ModelResponse = ModelMessageResponse>(
        params: LLMRequestParams
    ): Promise<GenerateOutputParams<T>> {
        return await this.queue.enqueue(async () => {
            const messages = params.messages.map(msg => ({
                role: msg.role === 'assistant' ? 'assistant' : 'user',
                content: msg.content
            }));

            try {
                const response = await this.makeAnthropicRequest(
                    messages,
                    params.systemPrompt,
                    params.opts
                );

                let content: any;
                const body = response.content[0];
                
                if (body.type === 'tool_call') {
                    content = body.tool_call.parameters;
                } else if (params.parseJSON) {
                    try {
                        const jsonMatch = body.text.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || [null, body.text];
                        const jsonContent = jsonMatch[1].trim();
                        content = JSON5.parse(jsonContent);
                    } catch (e) {
                        Logger.error("Failed to parse JSON response:", e);
                        Logger.error("Raw response:", body.text);
                        throw e;
                    }
                } else {
                    content = { message: body.text };
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
}
