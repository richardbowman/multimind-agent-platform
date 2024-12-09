import { ChatPost } from "src/chat/chatClient";
import { ModelResponse } from "../agents/schemas/ModelResponse";
import { StructuredOutputPrompt } from "./lmstudioService";
import { IEmbeddingFunction } from "chromadb";

export interface ILLMService {
    initializeEmbeddingModel(modelPath: string): Promise<void>;
    initializeLlamaModel(modelPath: string): Promise<void>;
    generate(instructions: string, userPost: ChatPost, history?: ChatPost[], opts?: any): Promise<ModelResponse>;
    sendMessageToLLM(message: string, history: any[], seedAssistant?: string, contextWindowLength?: number, maxTokens?: number, schema?: object): Promise<string>;
    generateStructured(userPost: ChatPost, instructions: StructuredOutputPrompt, history?: ChatPost[], contextWindowLength?: number, maxTokens?: number): Promise<any>;
    getEmbeddingModel(): IEmbeddingFunction;
}
