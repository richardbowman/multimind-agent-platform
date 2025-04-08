import { ChatPost } from "src/chat/chatClient";
import { GenerateOutputParams, ModelMessageResponse, ModelResponse } from "../schemas/ModelResponse";
import { LLMCallLogger } from "./LLMLogger";
import { ModelType } from "./types/ModelType";
import { ModelInfo } from "./types";
import { PromptBuilder } from "./promptBuilder";
import { UUID } from "src/types/uuid";
import { LLMProvider } from "./types/LLMProvider";

export interface EmbedderModelInfo extends ModelInfo {
    pipelineTag: string;
    supportedTasks: string[];
}

export interface IEmbeddingFunction {
    generate(texts: string[]): Promise<number[][]>;
}

export interface ModelSearchParams {
    /** Text to search in model names and IDs */
    textFilter?: string;
}

export interface LLMOptions extends Record<string, any> {
    modelType: ModelType;
    context: LLMContext;
}

export type LLMProviders = Record<LLMProvider, ILLMService>;
export type LLMServices = Record<ModelType, ILLMService>; 

export interface ILLMService {
    providerType() : string;

    shutdown(): Promise<void>;
    initializeChatModel(modelPath: string): Promise<void>;
    sendLLMRequest<T extends ModelResponse = ModelMessageResponse>(params: LLMRequestParams): Promise<GenerateOutputParams<T>>;
    countTokens(content: string): Promise<number>;
    getLogger(): LLMCallLogger;
    getAvailableModels(searchParams?: ModelSearchParams): Promise<ModelInfo[]>;

    /** @deprecated */
    generate<T extends ModelMessageResponse>(instructions: string, userPost: ChatPost, history?: ChatPost[], opts?: LLMOptions): Promise<T>;
    /** @deprecated */
    sendMessageToLLM(message: string, history: any[], seedAssistant?: string, contextWindowLength?: number, maxTokens?: number, schema?: object): Promise<string>;
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
    /** deprecated - use promptbuilder/outputtypes */
    tools?: LLMTool[];
    contextWindowLength?: number;
}

export interface IEmbeddingService {
    initializeEmbeddingModel(modelPath: string): Promise<void>;
    getAvailableEmbedders(searchParams?: ModelSearchParams): Promise<EmbedderModelInfo[]>;
    getEmbeddingModel(): IEmbeddingFunction;
}

export interface LLMContext {
    traceId?: UUID;
    agentId?: string;
    agentName?: string;
    stepType?: string;
    taskId?: string;
    projectId?: string;
    goal?: string;
    provider?: string;
    stepGoal?: string;
}

export interface LLMRequestParams {
    messages: { role: string; content: string | (string)[] }[];
    systemPrompt?: string;
    opts?: LLMPredictionOpts;
    parseJSON?: boolean;
    modelType?: ModelType;
    embeddingFunction?: IEmbeddingFunction;
    provider?: string;
    context?: LLMContext;
}

export class StructuredOutputPrompt {
    private schema: any;
    private prompt: Promise<string>|string|PromptBuilder;

    constructor(schema: any, prompt: Promise<string>|string|PromptBuilder) {
        this.schema = schema;
        this.prompt = prompt;
    }

    public getSchema(): any {
        return this.schema;
    }

    public getPrompt(): Promise<string>|string|PromptBuilder {
        return this.prompt;
    }
}
export enum ModelRole {
    USER = "user",
    ASSISTANT = "assistant",
    SYSTEM = "system"
}
