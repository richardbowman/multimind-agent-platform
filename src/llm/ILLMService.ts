import { ChatPost } from "src/chat/chatClient";
import { GenerateOutputParams, ModelMessageResponse, ModelResponse } from "../schemas/ModelResponse";
import { IEmbeddingFunction } from "chromadb";
import { LLMCallLogger } from "./LLMLogger";
import { ModelType } from "./LLMServiceFactory";
import { ModelInfo } from "./types";

export interface ILLMService {
    initializeChatModel(modelPath: string): Promise<void>;
    sendLLMRequest<T extends ModelResponse = ModelMessageResponse>(params: LLMRequestParams): Promise<GenerateOutputParams<T>>;
    countTokens(content: string): Promise<number>;
    getLogger(): LLMCallLogger;
    getAvailableModels(): Promise<ModelInfo[]>;

    /** @deprecated */
    generate<T extends ModelMessageResponse>(instructions: string, userPost: ChatPost, history?: ChatPost[], opts?: any): Promise<T>;
    /** @deprecated */
    sendMessageToLLM(message: string, history: any[], seedAssistant?: string, contextWindowLength?: number, maxTokens?: number, schema?: object): Promise<string>;
    /** @deprecated */
    generateStructured<T extends ModelResponse>(userPost: ChatPost, instructions: StructuredOutputPrompt, history?: ChatPost[], contextWindowLength?: number, maxTokens?: number): Promise<T>;
}

export interface LLMTool {
    name: string;
    description: string;
    parameters: Record<string, any>;
    type?: "function";  // Claude specific
    function?: {        // Claude specific
        name: string;
        parameters: Record<string, any>;
        description?: string;
    };
}

export interface LLMPredictionOpts {
    temperature?: number;
    topP?: number;
    maxPredictedTokens?: number;
    /** deprecated - use tools instead */
    structured?: {
        type: string;
        jsonSchema: any;
    };
    tools?: LLMTool[];
    contextWindowLength?: number;
}

export interface IEmbeddingService {
    initializeEmbeddingModel(modelPath: string): Promise<void>;
    getEmbeddingModel(): IEmbeddingFunction;
}

export interface LLMRequestParams {
    messages: { role: string; content: string }[];
    systemPrompt?: string;
    opts?: LLMPredictionOpts;
    parseJSON?: boolean;
    modelType?: ModelType;
    embeddingFunction?: IEmbeddingFunction;
}

export class StructuredOutputPrompt {
    private schema: any;
    private prompt: string;

    constructor(schema: any, prompt: string) {
        this.schema = schema;
        this.prompt = prompt;
    }

    public getSchema(): any {
        return this.schema;
    }

    public getPrompt(): string {
        return this.prompt;
    }
}
export enum ModelRole {
    USER = "user",
    ASSISTANT = "assistant",
    SYSTEM = "system"
}

