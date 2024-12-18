import { ChatPost } from "src/chat/chatClient";
import { GenerateOutputParams, ModelMessageResponse, ModelResponse } from "../schemas/ModelResponse";
import { ILLMService, LLMRequestParams, StructuredOutputPrompt } from "./ILLMService";

export abstract class BaseLLMService implements ILLMService {
    abstract initializeEmbeddingModel(modelPath: string): Promise<void>;
    abstract initializeChatModel(modelPath: string): Promise<void>;
    abstract getEmbeddingModel(): any;
    abstract sendLLMRequest<T extends ModelResponse>(params: LLMRequestParams): Promise<GenerateOutputParams<T>>;
    abstract countTokens(content: string): Promise<number>;

    async generate<T extends ModelMessageResponse>(instructions: string, userPost: ChatPost, history?: ChatPost[]): Promise<T> {
        const messages = [
            ...(history ? this.mapPosts(userPost, history) : []),
            {
                role: "user",
                content: userPost.message
            }
        ];

        const result = await this.sendLLMRequest<T>({
            messages,
            systemPrompt: instructions
        });

        return result.response;
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

    async generateStructured<T extends ModelResponse>(userPost: ChatPost, instructions: StructuredOutputPrompt, history?: ChatPost[], contextWindowLength?: number, maxTokens?: number): Promise<T> {
        const messages = [
            ...(history ? this.mapPosts(userPost, history) : []),
            {
                role: "user",
                content: userPost.message
            }
        ];

        const schema = instructions.getSchema();
        const prompt = instructions.getPrompt();

        const result = await this.sendLLMRequest<T>({
            messages,
            systemPrompt: prompt,
            opts: {
                maxPredictedTokens: maxTokens,
                structured: { type: "json", jsonSchema: schema }
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
}
