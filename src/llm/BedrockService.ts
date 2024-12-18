import { BedrockRuntimeClient, ConversationRole, ConverseCommand, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { BEDROCK_MAX_TOKENS_PER_MINUTE, BEDROCK_DEFAULT_DELAY_MS, BEDROCK_WINDOW_SIZE_MS } from "../helpers/config";
import JSON5 from 'json5';
import { RetryHelper } from "../helpers/retryHelper";
import { ILLMService, ModelRole } from "./ILLMService";

interface LLMRequestParams {
    messages: { role: string; content: string }[];
    systemPrompt?: string;
    opts?: {
        temperature?: number;
        topP?: number;
        maxTokens?: number;
        tools?: any;
    };
    parseJSON?: boolean;
}
import { AsyncQueue } from "../helpers/asyncQueue";
import { ChatPost } from "src/chat/chatClient";
import { GenerateOutputParams, ModelMessageResponse, ModelResponse } from "../schemas/ModelResponse";
import { StructuredOutputPrompt } from "./ILLMService";
import { IEmbeddingFunction } from "chromadb";
import Logger from "src/helpers/logger";
import { LLMCallLogger } from "./LLMLogger";

import { BaseLLMService } from "./BaseLLMService";

export class BedrockService extends BaseLLMService {
    private logger: LLMCallLogger;
    private runtimeClient: BedrockRuntimeClient;
    private modelId: string;
    private embeddingModelId: string;
    private embeddingService?: ILLMService;
    private lastCallTime: number = 0;
    private defaultDelay: number = BEDROCK_DEFAULT_DELAY_MS;
    private queue: AsyncQueue = new AsyncQueue();

    // Rate limiting settings
    private readonly MAX_TOKENS_PER_MINUTE = BEDROCK_MAX_TOKENS_PER_MINUTE;
    private tokenUsageWindow: number[] = [];
    private readonly WINDOW_SIZE_MS = BEDROCK_WINDOW_SIZE_MS;

    private async waitForNextCall(estimatedTokens: number = 100): Promise<void> {
        const now = Date.now();

        // Clean up old token usage entries only if needed
        if (this.tokenUsageWindow.length > 0 && now - this.tokenUsageWindow[0] >= this.WINDOW_SIZE_MS) {
            this.tokenUsageWindow = this.tokenUsageWindow.filter(
                timestamp => now - timestamp < this.WINDOW_SIZE_MS
            );

            const currentTokenCount = this.tokenUsageWindow.length;
            const windowPeriodMinutes = this.WINDOW_SIZE_MS / (60 * 1000);
            
            if (currentTokenCount > 0) {
                const oldestTimestamp = new Date(this.tokenUsageWindow[0]).toISOString();
                const newestTimestamp = new Date(this.tokenUsageWindow[this.tokenUsageWindow.length - 1]).toISOString();
                Logger.info(`Token window (${windowPeriodMinutes} min, ${oldestTimestamp} to ${newestTimestamp}) cleaned. Current usage: ${currentTokenCount}/${this.MAX_TOKENS_PER_MINUTE} (${Math.round(currentTokenCount / this.MAX_TOKENS_PER_MINUTE * 100)}%)`);
            } else {
                Logger.info(`Token window (${windowPeriodMinutes} min) cleaned. Current usage: 0/${this.MAX_TOKENS_PER_MINUTE} (0%)`);
            }
        }

        // Only log if we're approaching the limit
        if (this.tokenUsageWindow.length + estimatedTokens >= this.MAX_TOKENS_PER_MINUTE * 0.8) {
            Logger.warn(`High token usage: ${this.tokenUsageWindow.length}/${this.MAX_TOKENS_PER_MINUTE} - Requesting ${estimatedTokens} tokens`);
        }

        // Check if adding estimated tokens would exceed limit
        while (this.tokenUsageWindow.length + estimatedTokens >= this.MAX_TOKENS_PER_MINUTE) {
            const oldestTimestamp = this.tokenUsageWindow[0];
            const timeToWait = (oldestTimestamp + this.WINDOW_SIZE_MS) - now;

            if (timeToWait > 0) {
                Logger.info(`Rate limit reached, waiting ${Math.ceil(timeToWait / 1000)}s for token window to clear`);
                await new Promise(resolve => setTimeout(resolve, timeToWait + 100)); // Add small buffer

                // Refresh window after waiting
                const newNow = Date.now();
                this.tokenUsageWindow = this.tokenUsageWindow.filter(
                    timestamp => newNow - timestamp < this.WINDOW_SIZE_MS
                );
            } else {
                // Window has already cleared
                this.tokenUsageWindow = [];
                break;
            }
        }

        // Add basic delay between calls
        const timeSinceLastCall = now - this.lastCallTime;
        if (timeSinceLastCall < this.defaultDelay) {
            await new Promise(resolve => setTimeout(resolve, this.defaultDelay - timeSinceLastCall));
        }

        this.lastCallTime = Date.now();
    }

    private trackTokenUsage(tokenCount: number): void {
        const now = Date.now();
        // Pre-allocate array for better performance
        const newTokens = new Array(tokenCount).fill(now);
        this.tokenUsageWindow.push(...newTokens);

        const currentTokenCount = this.tokenUsageWindow.length;
        const usagePercent = Math.round(currentTokenCount / this.MAX_TOKENS_PER_MINUTE * 100);

        Logger.info(`Added ${tokenCount} tokens. Current usage: ${currentTokenCount}/${this.MAX_TOKENS_PER_MINUTE} (${usagePercent}%)`);
        if (usagePercent > 80) {
            Logger.warn(`High token usage: ${usagePercent}% of limit`);
        }
    }

    constructor(modelId: string, embeddingModelId: string = "amazon.titan-embed-text-v2:0", embeddingService?: ILLMService) {
        super();
        this.runtimeClient = new BedrockRuntimeClient({ region: process.env.AWS_REGION });
        this.modelId = modelId;
        this.embeddingModelId = embeddingModelId;
        this.embeddingService = embeddingService;
        this.logger = new LLMCallLogger('bedrock');
    }

    async initializeEmbeddingModel(modelPath: string): Promise<void> {
        if (this.embeddingService) {
            await this.embeddingService.initializeEmbeddingModel(modelPath);
            Logger.info("Using external embedding service");
        } else {
            Logger.info("Using Bedrock for embeddings with model: " + this.embeddingModelId);
        }
    }

    private async getEmbedding(text: string): Promise<number[]> {
        await this.waitForNextCall();
        const command = new InvokeModelCommand({
            modelId: "amazon.titan-embed-text-v2:0",
            body: JSON.stringify({
                inputText: text,
                embeddingTypes: ["float"]
            }),
            contentType: "application/json",
            accept: "application/json"
        });

        try {
            const response = await this.runtimeClient.send(command);
            const result = JSON.parse(new TextDecoder().decode(response.body));
            return result.embeddingsByType.float;
        } catch (error) {
            Logger.error("Bedrock embedding error:", error);
            throw error;
        }
    }

    async initializeChatModel(modelPath: string): Promise<void> {
        // No initialization needed for Bedrock
        Logger.info("Bedrock service ready");
    }


    getEmbeddingModel(): IEmbeddingFunction {
        if (this.embeddingService) {
            return this.embeddingService.getEmbeddingModel();
        }
        return {
            generate: async (texts: string[]): Promise<number[][]> => {
                const embeddings = await Promise.all(
                    texts.map(text => this.getEmbedding(text))
                );
                return embeddings;
            }
        };
    }

    private mergeConsecutiveMessages(messages: { role: string; content: string }[]): { role: string; content: string }[] {
        return messages.reduce((acc: { role: string; content: string }[], curr) => {
            if (acc.length > 0 && acc[acc.length - 1].role === curr.role) {
                // Merge with previous message of same role
                acc[acc.length - 1].content += '\n' + curr.content;
            } else {
                // Add as new message
                acc.push({ ...curr });
            }
            return acc;
        }, []);
    }

    public async sendLLMRequest<T extends ModelResponse = ModelMessageResponse>(params: LLMRequestParams): Promise<GenerateOutputParams<T>> {
        // Estimate tokens based on total text length
        const totalChars = params.systemPrompt?.length || 0 +
            params.messages.reduce((sum, msg) => sum + msg.content.length, 0);
        const estimatedTokens = Math.ceil(totalChars / 4);

        await this.waitForNextCall(estimatedTokens);

        return await this.queue.enqueue(async () => {
            // Merge consecutive messages from same role
            const mergedMessages = this.mergeConsecutiveMessages(params.messages);
            // Transform tools format if present
            let toolConfig;
            if (params.opts?.tools) {
                toolConfig = {
                    tools: params.opts.tools.map((tool: any) => ({
                        toolSpec: {
                            name: tool.name,
                            description: tool.description,
                            inputSchema: {
                                json: tool.parameters
                            }
                        }
                    }))
                };
            }
            const command = new ConverseCommand({
                modelId: this.modelId,
                system: [{
                    text: params.systemPrompt || "You are a helpful assistant"
                }],
                messages: mergedMessages.map(msg => ({
                    role: msg.role as ConversationRole,
                    content: [{
                        text: msg.content
                    }]
                })),
                toolConfig: toolConfig,
                inferenceConfig: {
                    temperature: params.opts?.temperature || 0.7,
                    topP: params.opts?.topP || 1,
                    maxTokens: params.opts?.maxTokens
                }
            });

            let response;
            try {
                response = await this.runtimeClient.send(command);
            } catch (error: any) {
                if (error?.name === 'ThrottlingException') {
                    response = await RetryHelper.withRetry(async () => {
                        return await this.runtimeClient.send(command);
                    }, "Bedrock sendLLMRequest() call - throttled");
                } else {
                    throw error;
                }
            }

            // Track token usage
            if (response.usage) {
                const inputTokens = response.usage.inputTokens || 0;
                const outputTokens = response.usage.outputTokens || 0;
                if (inputTokens + outputTokens > 0) {
                    this.trackTokenUsage(inputTokens + outputTokens);
                } else {
                    Logger.warn("Received zero token count from Bedrock API");
                }
            }

            // Extract content from response
            let rawContent = params.opts?.tools ? 
                response.output?.message?.content?.find(c => c.toolUse)?.toolUse?.input :
                response.output?.message?.content?.[0]?.text || '';

            // Remove code fence blocks if present
            if (typeof rawContent === 'string' && rawContent.includes('```json')) {
                rawContent = rawContent.replace(/```json\n?|\n?```/g, '');
            }

            // Parse JSON if requested and create final content
            let parsedContent;
            if (params.parseJSON && typeof rawContent === 'string') {
                try {
                    parsedContent = JSON5.parse(rawContent);
                } catch (e) {
                    Logger.error("Failed to parse JSON response:", e);
                    Logger.error("Raw content was:", rawContent);
                    throw e;
                }
            } else {
                parsedContent = rawContent;
            }

            const content = params.parseJSON ? 
                (parsedContent as T) : 
                ({ message: parsedContent } as ModelMessageResponse as T);

            const result = {
                response: content,
                metadata: {
                    _usage: {
                        inputTokens: response.usage?.inputTokens || 0,
                        outputTokens: response.usage?.outputTokens || 0
                    }
                }
            };

            // Log the LLM call
            const input = {
                messages: params.messages,
                systemPrompt: params.systemPrompt,
                opts: params.opts
            };
            await this.logger.logCall('sendLLMRequest', input, result.response);

            return result;
        });
    }

    async getTokenCount(text: string): Promise<number> {
        const estimatedTokens = Math.ceil(text.length / 4); // Rough estimate of 4 chars per token

        await this.waitForNextCall(estimatedTokens);
        const input = { text };

        // For Bedrock, we'll make a real conversation request but with minimal output
        const command = new ConverseCommand({
            modelId: this.modelId,
            system: [{
                text: "Count tokens only."
            }],
            messages: [{
                role: "user",
                content: [{
                    text: text
                }]
            }],
            inferenceConfig: {
                temperature: 0,
                maxTokens: 1  // Minimize output tokens
            }
        });

        let response;
        try {
            response = await this.runtimeClient.send(command);
        } catch (error: any) {
            if (error?.name === 'ThrottlingException') {
                response = await RetryHelper.withRetry(async () => {
                    return await this.runtimeClient.send(command);
                }, "Bedrock getTokenCount() call - throttled");
            } else {
                throw error;
            }
        }

        // Bedrock includes token counts in the response metadata
        const tokenCount = response.usage?.inputTokens || 0;

        if (tokenCount === 0) {
            Logger.warn("Received zero token count from Bedrock API");
        }

        await this.logger.logCall('getTokenCount', input, tokenCount);
        return tokenCount;
    }

}
