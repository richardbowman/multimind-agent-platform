import { BedrockRuntimeClient, ConverseCommand, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
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
import { ModelMessageResponse, ModelResponse } from "../schemas/ModelResponse";
import { StructuredOutputPrompt } from "./ILLMService";
import { IEmbeddingFunction } from "chromadb";
import Logger from "src/helpers/logger";
import { LLMCallLogger } from "./LLMLogger";

export class BedrockService implements ILLMService {
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

    async generate<M extends ModelMessageResponse>(instructions: string, userPost: ChatPost, history?: ChatPost[]): Promise<M> {
        const messages = this.formatMessages(userPost.message, history);
        const input = { instructions, messages };

        const result = await this.sendLLMRequest({
            messages,
            systemPrompt: instructions
        });

        const response = result.response as M;

        await this.logger.logCall('generate', input, response);
        return response;
    }

    private formatMessages(message: string, history?: ChatPost[]): any[] {
        const messages = [];
        let currentRole: string | null = null;
        let currentContent: string[] = [];

        // Process history first
        if (history) {
            for (const post of history) {
                const role = post.user_id === "assistant" ? "assistant" : "user";

                if (role === currentRole) {
                    // Merge consecutive messages of the same role
                    currentContent.push(post.message);
                } else {
                    // Save previous message group if it exists
                    if (currentRole) {
                        messages.push({
                            role: currentRole,
                            content: currentContent.join("\n\n")
                        });
                    }
                    // Start new message group
                    currentRole = role;
                    currentContent = [post.message];
                }
            }
        }

        // Handle the current message
        if (currentRole === "user") {
            // Merge with previous user message if exists
            currentContent.push(message);
            messages.push({
                role: "user",
                content: currentContent.join("\n\n")
            });
        } else {
            // Save previous message group if it exists
            if (currentRole) {
                messages.push({
                    role: currentRole,
                    content: currentContent.join("\n\n")
                });
            }
            // Add the current message
            messages.push({
                role: "user",
                content: message
            });
        }

        return messages;
    }

    async sendMessageToLLM(message: string, history: any[], seedAssistant?: string): Promise<string> {
        const input = { message, history, seedAssistant };
        let systemPrompt = "You are a helpful assistant";
        const messages = [];

        // Extract system message and process history
        for (const msg of history) {
            if (msg.role === "system") {
                systemPrompt = msg.content;
            } else {
                messages.push({
                    role: msg.role,
                    content: msg.content
                });
            }
        }

        // Add current message
        if (message.trim()) {
            messages.push({
                role: ModelRole.USER,
                content: message
            });
        }

        // Add seed assistant message if provided
        if (seedAssistant) {
            messages.push({
                role: ModelRole.ASSISTANT,
                content: seedAssistant
            });
        }

        try {
            const result = await this.sendLLMRequest({
                messages,
                systemPrompt
            });

            await this.logger.logCall('sendMessageToLLM', input, result);
            return (result.response as ModelMessageResponse).message || '';
        } catch (error) {
            await this.logger.logCall('sendMessageToLLM', input, null, error);
            throw error;
        }
    }

    async generateStructured<M extends ModelResponse>(userPost: ChatPost, instructions: StructuredOutputPrompt): Promise<M> {
        const input = { userPost, instructions: instructions.getPrompt() };
        const schema = instructions.getSchema();
        const prompt = instructions.getPrompt();

        // Create a tool that enforces our schema
        const tools = {
            tools: [{
                "toolSpec": {
                    "name": "generate_structured_output",
                    "description": `Generate structured data according to the following instructions: ${prompt}`,
                    "inputSchema": {
                        "json": schema
                    }
                }
            }]
        };

        try {
            const result = await this.sendLLMRequest({
                messages: [{
                    role: ModelRole.USER,
                    content: userPost.message
                }],
                systemPrompt: `${prompt} You MUST CALL "generate_structured_output" tool to submit your response.`,
                opts: {
                    temperature: 1,
                    topP: 1,
                    tools
                },
                parseJSON: true
            });

            await this.logger.logCall('generateStructured', input, result);
            return result as M;
        } catch (error) {
            await this.logger.logCall('generateStructured', input, null, error);
            throw error;
        }
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

    /**
     * Understand how large a particular text block is
     * @param text the content to be counted
     * @returns 
     */
    private async sendLLMRequest<T extends ModelResponse = ModelMessageResponse>(params: LLMRequestParams): Promise<GenerateOutputParams<T>> {
        // Estimate tokens based on total text length
        const totalChars = params.systemPrompt?.length || 0 +
            params.messages.reduce((sum, msg) => sum + msg.content.length, 0);
        const estimatedTokens = Math.ceil(totalChars / 4);

        await this.waitForNextCall(estimatedTokens);

        return await this.queue.enqueue(async () => {
            const command = new ConverseCommand({
                modelId: this.modelId,
                system: [{
                    text: params.systemPrompt || "You are a helpful assistant"
                }],
                messages: params.messages.map(msg => ({
                    role: msg.role,
                    content: [{
                        text: msg.content
                    }]
                })),
                toolConfig: params.opts?.tools,
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
            const content = params.opts?.tools ? 
                response.output?.message?.content?.find(c => c.toolUse)?.toolUse?.input :
                response.output?.message?.content?.[0]?.text || '';

            // Parse JSON if requested
            const parsedContent = params.parseJSON && typeof content === 'string' 
                ? JSON5.parse(content) 
                : content;

            const content = params.parseJSON ? 
                (parsedContent as T) : 
                ({ message: parsedContent } as ModelMessageResponse as T);

            return {
                response: content,
                metadata: {
                    _usage: {
                        inputTokens: response.usage?.inputTokens || 0,
                        outputTokens: response.usage?.outputTokens || 0
                    }
                }
            };
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
