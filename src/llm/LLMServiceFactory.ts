import { IEmbeddingService, ILLMService } from "./ILLMService";
import LMStudioService from "./lmstudioService";
import { BedrockService } from "./BedrockService";
import { AnthropicService } from "./AnthropicService";
import { LlamaCppService } from "./LlamaCppService";
import { Settings } from "../tools/settingsManager";
import { OpenAIService } from "./OpenAIService";

export enum LLMProvider {
    LMSTUDIO = "lmstudio",
    BEDROCK = "bedrock",
    ANTHROPIC = "anthropic",
    LLAMA_CPP = "llama-cpp",
    OPENAI = "openai",
    OPENROUTER = "openrouter"
}


export enum ModelType {
    CONVERSATION = "conversation",
    REASONING = "reasoning",
    DOCUMENT = "document"
}

export class LLMServiceFactory {
    static createEmbeddingService(settings: Settings): IEmbeddingService {
        switch (settings.providers.embeddings) {
            case LLMProvider.LMSTUDIO:
                return new LMStudioService();
            case LLMProvider.BEDROCK:
                return new BedrockService(
                    settings.models.conversation.bedrock,
                    settings.embeddingModel
                );
            case LLMProvider.OPENAI:
                if (!settings.openai?.api?.key) {
                    throw new Error("OpenAI API key is required for embeddings");
                }
                return new OpenAIService(
                    settings.openai.api.key,
                    settings.models.conversation.openai || "gpt-3.5-turbo",
                    settings.embeddingModel || "text-embedding-ada-002"
                );
            default:
                throw new Error(`Unsupported embedding provider: ${settings.providers.embeddings}`);
        }
    }

    static createService(settings: Settings, modelType: ModelType = ModelType.CONVERSATION): ILLMService {
        // Create main chat service
        switch (settings.providers.chat) {
            case LLMProvider.LMSTUDIO:
                return new LMStudioService();
            case LLMProvider.BEDROCK:
                return new BedrockService(
                    settings.models.conversation.bedrock,
                    settings.embeddingModel
                );
            case LLMProvider.ANTHROPIC:
                return new AnthropicService(
                    settings.anthropic.api.key,
                    settings.models.conversation.anthropic
                );
            case LLMProvider.LLAMA_CPP:
                return new LlamaCppService();
            case LLMProvider.OPENAI:
                if (!settings.openai?.api?.key) {
                    throw new Error("OpenAI API key is required");
                }
                return new OpenAIService(
                    settings.openai.api.key,
                    settings.models.conversation.openai || "gpt-3.5-turbo",
                    settings.embeddingModel || "text-embedding-ada-002"
                );
            case LLMProvider.OPENROUTER:
                if (!settings.openrouter?.api?.key) {
                    throw new Error("OpenRouter API key is required");
                }
                return new OpenAIService(
                    settings.openrouter.api.key,
                    settings.models.conversation.openrouter || "gpt-3.5-turbo",
                    settings.embeddingModel || "text-embedding-ada-002",
                    "https://openrouter.ai/api/v1"
                );
            default:
                throw new Error(`Unsupported chat provider: ${settings.providers.chat}`);
        }
    }
}
