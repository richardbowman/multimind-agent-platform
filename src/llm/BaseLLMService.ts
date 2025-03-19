import { ChatPost, Message } from "src/chat/chatClient";
import { GenerateOutputParams, ModelMessageResponse, ModelResponse } from "../schemas/ModelResponse";
import { ILLMService, LLMOptions, LLMRequestParams, LLMTool, StructuredOutputPrompt } from "./ILLMService";
import { LLMCallLogger } from "./LLMLogger";
import { ModelType } from "./LLMServiceFactory";
import { ModelInfo } from "./types";
import { PromptBuilder } from "./promptBuilder";

export abstract class BaseLLMService implements ILLMService {
    protected logger: LLMCallLogger;

    abstract initializeEmbeddingModel(modelPath: string): Promise<void>;
    abstract initializeChatModel(modelPath: string): Promise<void>;
    abstract getEmbeddingModel(): any;
    abstract sendLLMRequest<T extends ModelResponse>(params: LLMRequestParams): Promise<GenerateOutputParams<T>>;
    abstract countTokens(content: string): Promise<number>;
    abstract getAvailableModels(): Promise<ModelInfo[]>;
    abstract shutdown(): Promise<void>;

    constructor(name: string) {
        this.logger = new LLMCallLogger(name);
    }

    getLogger(): LLMCallLogger {
        return this.logger;
    }

    async generate<T extends ModelMessageResponse>(instructions: string, userPost: ChatPost, history?: ChatPost[], opts?: LLMOptions): Promise<T> {
        // this checks to see if the threadPosts already contains the userPost, if so, we trim back the threadPosts
        // because the userpost will get added back in
        const userPostInHistory = history ? history.findIndex(p => p.id === userPost?.id) : -1;
        const cleanedHistory = userPostInHistory >= 0 ? history?.slice(0, userPostInHistory) : history;

        const messages = [
            ...(history ? this.mapPosts(userPost, cleanedHistory) : []),
            {
                role: "user",
                content: userPost.message
            }
        ];

        const result = await this.sendLLMRequest<T>({
            messages,
            systemPrompt: instructions,
            modelType: opts?.modelType,
            context: opts?.context
        });

        return typeof result === "string" ? {message: result as string} as T : result.response;
    }

    async sendMessageToLLM(message: string, history: any[], seedAssistant?: string, contextWindowLength?: number, maxTokens?: number, schema?: object): Promise<string> {
        const messages = [...history];
        messages.push({ role: "user", content: message });

        if (seedAssistant) {
            messages.push({ role: "assistant", content: seedAssistant });
        }

        const opts: any = { maxPredictedTokens: maxTokens };
        if (schema) {
            opts.structured = { type: "json", jsonSchema: schema };
        }

        const result = await this.sendLLMRequest<ModelMessageResponse>({
            messages,
            opts,
            parseJSON: !!schema
        });

        return result.response.message || '';
    }

    async generateStructured<T extends ModelResponse>(userPost: Message, instructions: StructuredOutputPrompt, history?: ChatPost[], contextWindowLength?: number, maxTokens?: number): Promise<T> {
        const messages = [
            ...(history ? this.mapPosts(userPost, history) : []),
            {
                role: "user",
                content: userPost.message
            }
        ];

        const schema = instructions.getSchema();
        let prompt = await instructions.getPrompt();
        if (prompt instanceof PromptBuilder) {
            prompt = await prompt.build();
        }

        const result = await this.sendLLMRequest<T>({
            messages,
            systemPrompt: prompt,
            opts: {
                maxPredictedTokens: maxTokens,
                tools: [this.convertToToolFormat(schema, prompt)]
            },
            parseJSON: true
        });

        return result.response;
    }

    protected mapPosts(userPost: ChatPost, posts?: ChatPost[]) {
        if (!posts) return [];
        return posts.map(h => ({
            role: h.user_id === userPost.user_id ? "user" : "assistant",
            content: h.message
        }));
    }

    protected convertToToolFormat(schema: any, prompt: string): LLMTool {
        return {
            name: "generate_structured_output",
            description: `Generate structured response.`,
            parameters: schema
        };
    }
}
