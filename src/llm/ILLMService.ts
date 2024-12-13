import { ChatPost } from "src/chat/chatClient";
import { ModelMessageResponse } from "../schemas/ModelResponse";
import { IEmbeddingFunction } from "chromadb";

export interface ILLMService {
    initializeEmbeddingModel(modelPath: string): Promise<void>;
    initializeLlamaModel(modelPath: string): Promise<void>;
    generate(instructions: string, userPost: ChatPost, history?: ChatPost[], opts?: any): Promise<ModelMessageResponse>;
    sendMessageToLLM(message: string, history: any[], seedAssistant?: string, contextWindowLength?: number, maxTokens?: number, schema?: object): Promise<string>;
    generateStructured(userPost: ChatPost, instructions: StructuredOutputPrompt, history?: ChatPost[], contextWindowLength?: number, maxTokens?: number): Promise<any>;
    getEmbeddingModel(): IEmbeddingFunction;
    getTokenCount(message: string): Promise<number>;
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
    ASSISTANT = "assistant"
}

