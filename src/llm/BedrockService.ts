import { BedrockRuntimeClient, ConverseCommand, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import LMStudioService from "./lmstudioService";
import { ILLMService } from "./ILLMService";
import { ChatPost } from "src/chat/chatClient";
import { ModelMessageResponse } from "../schemas/ModelResponse";
import { StructuredOutputPrompt } from "./lmstudioService";
import { IEmbeddingFunction } from "chromadb";
import Logger from "src/helpers/logger";
import { LLMCallLogger } from "./LLMLogger";

export class BedrockService implements ILLMService {
    private logger: LLMCallLogger;
    private client: BedrockRuntimeClient;
    private modelId: string;
    private embeddingModelId: string;
    private embeddingService?: ILLMService;
    private lastCallTime: number = 0;
    private defaultDelay: number = 1000; // 1 second delay between calls
    
    private async waitForNextCall(): Promise<void> {
        const now = Date.now();
        const timeSinceLastCall = now - this.lastCallTime;
        if (timeSinceLastCall < this.defaultDelay) {
            await new Promise(resolve => setTimeout(resolve, this.defaultDelay - timeSinceLastCall));
        }
        this.lastCallTime = Date.now();
    }

    constructor(modelId: string, embeddingModelId: string = "amazon.titan-embed-text-v2:0", embeddingService?: ILLMService) {
        this.client = new BedrockRuntimeClient({ region: process.env.AWS_REGION });
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
            const response = await this.client.send(command);
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
        await this.waitForNextCall();
        const messages = this.formatMessages(userPost.message, history);
        const input = { instructions, messages };
        
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
                topP: 1,
                topK: 250
            }
        });

        try {
            const response = await this.client.send(command);
            const result = response.output?.message?.content?.[0];
            const response = {
                message: result?.text || ''
            };
            await this.logger.logCall('generate', input, response);
            return response;
        } catch (error) {
            Logger.error("Bedrock API error:", error);
            await this.logger.logCall('generate', input, null, error);
            throw error;
        }
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

        const command = new ConverseCommand({
            modelId: this.modelId,
            system: [{
                text: systemPrompt
            }],
            messages: processedMessages,
            inferenceConfig: {
                temperature: 0.7,
                topP: 1,
                topK: 250
            }
        });

        try {
            const response = await this.client.send(command);
            const result = response.output?.message?.content?.[0];
            const output = result?.text || '';
            await this.logger.logCall('sendMessageToLLM', input, output);
            return output;
        } catch (error) {
            await this.logger.logCall('sendMessageToLLM', input, null, error);
            throw error;
        }
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
                topP: 1,
                topK: 1
            }
        });

        try {
            const response = await this.client.send(command);

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
        const command = new InvokeModelCommand({
            modelId: this.modelId,
            body: JSON.stringify({
                anthropic_version: "bedrock-2023-05-31",
                messages: [
                    { role: "user", content: text }
                ],
                max_tokens: 1  // We don't need any tokens generated
            })
        });

        try {
            const response = await this.client.send(command);
            const result = JSON.parse(new TextDecoder().decode(response.body));
            const output = result.usage.input_tokens;
            await this.logger.logCall('getTokenCount', input, output);
            return output;
        } catch (error) {
            Logger.error("Token count error:", error);
            await this.logger.logCall('getTokenCount', input, null, error);
            throw error;
        }
    }
}
