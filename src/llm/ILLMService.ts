import { ChatPost } from "src/chat/chatClient";
import { GenerateOutputParams, ModelMessageResponse, ModelResponse } from "../schemas/ModelResponse";
import { LLMCallLogger } from "./LLMLogger";
import { ModelType } from "./LLMServiceFactory";
import { ModelInfo } from "./types";
import { PromptBuilder } from "./promptBuilder";

export interface EmbedderModelInfo extends ModelInfo {
    pipelineTag: string;
    supportedTasks: string[];
}

export interface IEmbeddingFunction {
    generate(texts: string[]): Promise<number[][]>;
}

export interface VisionContent {
    type: "image_url";
    image_url: {
        url: string;
        detail?: "low" | "high" | "auto";
    };
}

export interface ModelSearchParams {
    /** Text to search in model names and IDs */
    textFilter?: string;
}

export interface ILLMService {
    shutdown(): Promise<void>;
    initializeChatModel(modelPath: string): Promise<void>;
    sendLLMRequest<T extends ModelResponse = ModelMessageResponse>(params: LLMRequestParams): Promise<GenerateOutputParams<T>>;
    sendVisionRequest<T extends ModelResponse = ModelMessageResponse>(params: LLMRequestParams): Promise<GenerateOutputParams<T>>;
    countTokens(content: string): Promise<number>;
    getLogger(): LLMCallLogger;
    getAvailableModels(searchParams?: ModelSearchParams): Promise<ModelInfo[]>;
    getAvailableEmbedders(searchParams?: ModelSearchParams): Promise<EmbedderModelInfo[]>;

    /** @deprecated */
    generate<T extends ModelMessageResponse>(instructions: string, userPost: ChatPost, history?: ChatPost[], opts?: any): Promise<T>;
    /** @deprecated */
    sendMessageToLLM(message: string, history: any[], seedAssistant?: string, contextWindowLength?: number, maxTokens?: number, schema?: object): Promise<string>;
    /** @deprecated */
    generateStructured<T extends ModelResponse>(userPost: ChatPost, instructions: StructuredOutputPrompt, history?: ChatPost[], contextWindowLength?: number, maxTokens?: number): Promise<T>;
}

export interface JSONObjectSchema extends JSONSchema {
    type: "object";
}

export interface JSONSchema {
    type: "object" | "array";
    properties: Record<string, any>;
    required?: string[];
    additionalProperties?: boolean;
}

export interface LLMTool {
    name: string;
    description: string;
    parameters: JSONObjectSchema;
    type?: "function";
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
    messages: { role: string; content: string | VisionContent | (string | VisionContent)[] }[];
    systemPrompt?: string;
    opts?: LLMPredictionOpts;
    parseJSON?: boolean;
    modelType?: ModelType;
    embeddingFunction?: IEmbeddingFunction;
}

export class StructuredOutputPrompt {
    private schema: any;
    private prompt: string|PromptBuilder;

    constructor(schema: any, prompt: string|PromptBuilder) {
        this.schema = schema;
        this.prompt = prompt;
    }

    public getSchema(): any {
        return this.schema;
    }

    public getPrompt(): string|PromptBuilder {
        return this.prompt;
    }
}
export enum ModelRole {
    USER = "user",
    ASSISTANT = "assistant",
    SYSTEM = "system"
}
