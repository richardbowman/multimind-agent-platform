import { BedrockRuntimeClient, ConverseCommand, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { BEDROCK_MAX_TOKENS_PER_MINUTE, BEDROCK_DEFAULT_DELAY_MS, BEDROCK_WINDOW_SIZE_MS } from "../helpers/config";
import LMStudioService from "./lmstudioService";
import { ILLMService } from "./ILLMService";
import { AsyncQueue } from "../helpers/asyncQueue";
import { ChatPost } from "src/chat/chatClient";
import { ModelMessageResponse } from "../schemas/ModelResponse";
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
            const oldestTimestamp = new Date(this.tokenUsageWindow[0]).toISOString();
            const newestTimestamp = new Date(this.tokenUsageWindow[this.tokenUsageWindow.length - 1]).toISOString();
            Logger.info(`Token window (${windowPeriodMinutes} min, ${oldestTimestamp} to ${newestTimestamp}) cleaned. Current usage: ${currentTokenCount}/${this.MAX_TOKENS_PER_MINUTE} (${Math.round(currentTokenCount / this.MAX_TOKENS_PER_MINUTE * 100)}%)`);
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

    async initializeLlamaModel(modelPath: string): Promise<void> {
        // No initialization needed for Bedrock
        Logger.info("Bedrock service ready");
    }

    async generate(instructions: string, userPost: ChatPost, history?: ChatPost[]): Promise<ModelMessageResponse> {
        const messages = this.formatMessages(userPost.message, history);
        const input = { instructions, messages };

        // Estimate tokens - rough estimate based on characters
        const totalChars = instructions.length +
            messages.reduce((sum, msg) => sum + msg.content.length, 0);
        const estimatedTokens = Math.ceil(totalChars / 4); // Rough estimate of 4 chars per token

        await this.waitForNextCall(estimatedTokens);

        return await this.queue.enqueue(async () => {
            const command = new ConverseCommand({
                modelId: this.modelId,
                system: [{
                    text: instructions
                }],
                messages: messages.map(msg => ({
                    role: msg.role,
                    content: [{
                        text: msg.content
                    }]
                })),
                inferenceConfig: {
                    temperature: 0.7,
                    topP: 1
                }
            });

            try {
                const bedrockResponse = await this.runtimeClient.send(command);
                const result = bedrockResponse.output?.message?.content?.[0];
                const response = {
                    message: result?.text || ''
                };

                // Track token usage from response
                if (bedrockResponse.usage) {
                    const inputTokens = bedrockResponse.usage.inputTokens || 0;
                    const outputTokens = bedrockResponse.usage.outputTokens || 0;
                    if (inputTokens + outputTokens > 0) {
                        this.trackTokenUsage(inputTokens + outputTokens);
                    } else {
                        Logger.warn("Received zero token count from Bedrock API in generate()");
                    }
                }

                await this.logger.logCall('generate', input, bedrockResponse);
                return response;
            } catch (error) {
                Logger.error("Bedrock API error:", error);
                await this.logger.logCall('generate', input, null, error);
                throw error;
            }
        });
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
        await this.waitForNextCall();
        const input = { message, history, seedAssistant };
        let systemPrompt = "You are a helpful assistant";
        const processedMessages = [];

        // Extract system message and process history
        for (const msg of history) {
            if (msg.role === "system") {
                systemPrompt = msg.content;
            } else {
                processedMessages.push({
                    role: msg.role,
                    content: [{
                        text: msg.content
                    }]
                });
            }
        }

        // Add current message
        if (message.trim()) {
            processedMessages.push({
                role: "user",
                content: [{
                    text: message
                }]
            });
        }

        // Add seed assistant message if provided
        if (seedAssistant) {
            processedMessages.push({
                role: "assistant",
                content: [{
                    text: seedAssistant
                }]
            });
        }

        return await this.queue.enqueue(async () => {
            const command = new ConverseCommand({
                modelId: this.modelId,
                system: [{
                    text: systemPrompt
                }],
                messages: processedMessages,
                inferenceConfig: {
                    temperature: 0.7,
                    topP: 1
                }
            });

            try {
                const response = await this.runtimeClient.send(command);
                const result = response.output?.message?.content?.[0];
                const output = result?.text || '';

                // Track token usage from response
                if (response.usage) {
                    const inputTokens = response.usage.inputTokens || 0;
                    const outputTokens = response.usage.outputTokens || 0;
                    if (inputTokens + outputTokens > 0) {
                        this.trackTokenUsage(inputTokens + outputTokens);
                    } else {
                        Logger.warn("Received zero token count from Bedrock API in sendMessageToLLM()");
                    }
                }

                await this.logger.logCall('sendMessageToLLM', input, output);
                return output;
            } catch (error) {
                await this.logger.logCall('sendMessageToLLM', input, null, error);
                throw error;
            }
        });
    }

    async generateStructured(userPost: ChatPost, instructions: StructuredOutputPrompt): Promise<any> {
        await this.waitForNextCall();
        const input = { userPost, instructions: instructions.getPrompt() };
        const schema = instructions.getSchema();
        const prompt = instructions.getPrompt();

        // Create a tool that enforces our schema
        const tools = {
            tools: [
                {
                    "toolSpec": {
                        "name": "generate_structured_output",
                        "description": `Generate structured data according to the following instructions: ${prompt}`,
                        "inputSchema": {
                            "json": schema
                        }
                    }
                }
            ]
        };

        return await this.queue.enqueue(async () => {
            const command = new ConverseCommand({
                modelId: this.modelId,
                system: [{
                    "text": `${prompt} You MUST CALL "generate_structured_output" tool to submit your response.`
                }],
                messages: [{
                    role: "user",
                    content: [{
                        "text": userPost.message
                    }]
                }],
                toolConfig: tools,
                inferenceConfig: {
                    temperature: 1,
                    topP: 1
                }
            });

            try {
                const response = await this.runtimeClient.send(command);

                // Track token usage from response
                if (response.usage) {
                    const inputTokens = response.usage.inputTokens || 0;
                    const outputTokens = response.usage.outputTokens || 0;
                    if (inputTokens + outputTokens > 0) {
                        this.trackTokenUsage(inputTokens + outputTokens);
                    } else {
                        Logger.warn("Received zero token count from Bedrock API in generateStructured()");
                    }
                }

                // Extract tool use from response
                const result = response.output?.message?.content?.find(c => c.toolUse);
                if (!result) {
                    throw new Error("No tool use found in response");
                }

                const output = result.toolUse?.input;
                await this.logger.logCall('generateStructured', input, output);
                return output;
            } catch (error) {
                Logger.error("Structured generation error:", error);
                await this.logger.logCall('generateStructured', input, null, error);
                throw error;
            }
        });
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

    async getTokenCount(text: string): Promise<number> {
        await this.waitForNextCall();
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

        try {
            const response = await this.runtimeClient.send(command);
            // Bedrock includes token counts in the response metadata
            const tokenCount = response.usage?.inputTokens || 0;

            if (tokenCount === 0) {
                Logger.warn("Received zero token count from Bedrock API");
            }

            await this.logger.logCall('getTokenCount', input, tokenCount);
            return tokenCount;
        } catch (error) {
            Logger.error("Token count error:", error);
            await this.logger.logCall('getTokenCount', input, null, error);
            throw error;
        }
    }

}
