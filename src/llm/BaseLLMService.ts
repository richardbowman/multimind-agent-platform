import { ChatPost, Message } from "src/chat/chatClient";
import { GenerateOutputParams, ModelMessageResponse, ModelResponse } from "../schemas/ModelResponse";
import { ILLMService, LLMOptions, LLMRequestParams, LLMTool, StructuredOutputPrompt } from "./ILLMService";
import { LLMCallLogger } from "./LLMLogger";
import { ModelType, ModelTypeFallbackStrategy } from "./types/ModelType";
import { ModelInfo } from "./types";
import { PromptBuilder } from "./promptBuilder";
import { SettingsManager } from "src/tools/settingsManager";
import { Settings } from "src/tools/settings";

export abstract class BaseLLMService implements ILLMService {
    protected logger: LLMCallLogger;
    
    abstract initializeChatModel(modelPath: string): Promise<void>;
    abstract sendLLMRequest<T extends ModelResponse>(params: LLMRequestParams): Promise<GenerateOutputParams<T>>;
    abstract countTokens(content: string): Promise<number>;
    abstract getAvailableModels(): Promise<ModelInfo[]>;
    abstract shutdown(): Promise<void>;
    abstract providerType(): string;
    
    constructor(name: string, protected settings: Settings) {
        this.logger = new LLMCallLogger(name);
    }


    // return an available model type based on preferred
    selectModel(preferredModelType?: ModelType): string {
        const lookup = (modelType: ModelType) => this.settings?.modelConfigs.find(c => c.enabled && c.provider === this.providerType() &&  c.type === modelType)?.model;
        let modelType : ModelType|null = preferredModelType||ModelType.REASONING;
        let model;
        while (!model && modelType && !(model = lookup(modelType)) && ModelTypeFallbackStrategy[modelType]) {
            modelType = ModelTypeFallbackStrategy[modelType];
        }
        if (!model) {
            throw new Error(`Cannot find model ${modelType} in configuration after trying to fallback to conversation type.`);
        }
        return model;
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
            context: {
                ...opts?.context,
                ...this.providerType ? {provider: this.providerType()}: {}
            }
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
