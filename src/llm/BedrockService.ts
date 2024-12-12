import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import LMStudioService from "./lmstudioService";
import { ILLMService } from "./ILLMService";
import { ChatPost } from "src/chat/chatClient";
import { ModelResponse } from "../agents/schemas/ModelResponse";
import { StructuredOutputPrompt } from "./lmstudioService";
import { IEmbeddingFunction } from "chromadb";
import Logger from "src/helpers/logger";

export class BedrockService implements ILLMService {
    private client: BedrockRuntimeClient;
    private modelId: string;
    private embeddingModelId: string;

    constructor(modelId: string, embeddingModelId: string = "amazon.titan-embed-text-v1") {
        this.client = new BedrockRuntimeClient({ region: process.env.AWS_REGION });
        this.modelId = modelId;
        this.embeddingModelId = embeddingModelId;
    }

    async initializeEmbeddingModel(_modelPath: string): Promise<void> {
        // No initialization needed for Bedrock embeddings
        Logger.info("Using Bedrock for embeddings with model: " + this.embeddingModelId);
    }

    private async getEmbedding(text: string): Promise<number[]> {
        const command = new InvokeModelCommand({
            modelId: this.embeddingModelId,
            body: JSON.stringify({
                inputText: text
            })
        });

        try {
            const response = await this.client.send(command);
            const result = JSON.parse(new TextDecoder().decode(response.body));
            return result.embedding;
        } catch (error) {
            Logger.error("Bedrock embedding error:", error);
            throw error;
        }
    }

    async initializeLlamaModel(modelPath: string): Promise<void> {
        // No initialization needed for Bedrock
        Logger.info("Bedrock service ready");
    }

    async generate(instructions: string, userPost: ChatPost, history?: ChatPost[]): Promise<ModelResponse> {
        const messages = this.formatMessages(userPost.message, history);
        
        const command = new InvokeModelCommand({
            modelId: this.modelId,
            body: JSON.stringify({
                anthropic_version: "bedrock-2023-05-31",
                max_tokens: 2048,
                temperature: 0.7,
                system: instructions,
                messages: messages
            })
        });

        try {
            const response = await this.client.send(command);
            const result = JSON.parse(new TextDecoder().decode(response.body));
            return {
                message: result.content[0].text
            };
        } catch (error) {
            Logger.error("Bedrock API error:", error);
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
        let mergedMessages = [];
        let currentRole: string | null = null;
        let currentContent: string[] = [];
        let systemPrompt = "You are a helpful assistant";

        // Process history
        for (const msg of history) {
            if (msg.role === currentRole) {
                currentContent.push(msg.content);
            } else if (msg.role === "system") {
                systemPrompt = msg.content;
            } else {
                if (currentRole) {
                    mergedMessages.push({
                        role: currentRole,
                        content: currentContent.join("\n\n")
                    });
                }
                currentRole = msg.role;
                currentContent = [msg.content];
            }
        }

        // Handle the current message if not empty
        if (message.trim()) {
            if (currentRole === "user") {
                currentContent.push(message);
            } else {
                if (currentRole) {
                    mergedMessages.push({
                        role: currentRole,
                        content: currentContent.join("\n\n")
                    });
                }
                currentRole = "user";
                currentContent = [message];
            }
        }

        // Handle seed assistant message
        if (seedAssistant) {
            if (currentRole) {
                mergedMessages.push({
                    role: currentRole,
                    content: currentContent.join("\n\n")
                });
            }
            mergedMessages.push({
                role: "assistant",
                content: seedAssistant
            });
        } else if (currentRole) {
            mergedMessages.push({
                role: currentRole,
                content: currentContent.join("\n\n")
            });
        }

        const command = new InvokeModelCommand({
            modelId: this.modelId,
            body: JSON.stringify({
                anthropic_version: "bedrock-2023-05-31",
                max_tokens: 2048,
                system: systemPrompt,
                messages: mergedMessages
            })
        });

        const response = await this.client.send(command);
        const result = JSON.parse(new TextDecoder().decode(response.body));
        return result.content[0].text;
    }

    async generateStructured(userPost: ChatPost, instructions: StructuredOutputPrompt): Promise<any> {
        const schema = instructions.getSchema();
        const prompt = instructions.getPrompt();

        // Create a tool that enforces our schema
        const tools = [{
            name: "generate_structured_output",
            description: `Generate structured data according to the following instructions: ${prompt}`,
            input_schema: schema
        }];

        const command = new InvokeModelCommand({
            modelId: this.modelId,
            body: JSON.stringify({
                anthropic_version: "bedrock-2023-05-31",
                max_tokens: 2048,
                temperature: 0.1,
                system: "You are a helpful assistant that generates structured data.",
                messages: [{
                    role: "user",
                    content: userPost.message
                }],
                tools: tools,
                tool_choice: { type: "tool", name: "generate_structured_output" }
            })
        });

        try {
            const response = await this.client.send(command);
            const result = JSON.parse(new TextDecoder().decode(response.body));
            
            // Extract tool use from response
            const toolUse = result.content.find((block: any) => block.type === "tool_use");
            if (!toolUse) {
                throw new Error("No tool use found in response");
            }

            return toolUse.input;
        } catch (error) {
            Logger.error("Structured generation error:", error);
            throw error;
        }
    }

    getEmbeddingModel(): IEmbeddingFunction {
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
            return result.usage.input_tokens;
        } catch (error) {
            Logger.error("Token count error:", error);
            throw error;
        }
    }
}
