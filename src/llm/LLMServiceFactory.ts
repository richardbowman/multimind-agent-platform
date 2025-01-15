import { IEmbeddingService, ILLMService } from "./ILLMService";
import LMStudioService from "./lmstudioService";
import { BedrockService } from "./BedrockService";
import { AnthropicService } from "./AnthropicService";
import { LlamaCppService } from "./LlamaCppService";
import { Settings } from "../tools/settings";
import { OpenAIService } from "./OpenAIService";

export enum LLMProvider {
    LMSTUDIO = "lmstudio",
    BEDROCK = "bedrock",
    ANTHROPIC = "anthropic",
    LLAMA_CPP = "llama_cpp",
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
                return new LMStudioService(settings.lmStudioBaseUrl);
            case LLMProvider.BEDROCK:
                return new BedrockService(
                    settings.models.conversation.bedrock,
                    undefined
                );
            case LLMProvider.OPENAI:
                if (!settings.openai?.api?.key) {
                    throw new Error("OpenAI API key is required for embeddings");
                }
                return new OpenAIService(
                    settings.openai.api.key,
                    settings.models.conversation.openai || "gpt-3.5-turbo",
                    settings.models.embeddings.openai || "text-embedding-ada-002"
                );
            case LLMProvider.LLAMA_CPP:
                return new LlamaCppService(settings.llama_cpp_execution_mode);
            default:
                throw new Error(`Unsupported embedding provider: ${settings.providers.embeddings}`);
        }
    }
    static createService(settings: Settings, modelType: ModelType = ModelType.CONVERSATION): ILLMService {
        return this.createServiceByName(settings.providers.chat, settings, modelType);
    }

    static createServiceByName(name: string, settings: Settings, modelType: ModelType = ModelType.CONVERSATION): ILLMService {
            // Create main chat service
        switch (name) {
            case LLMProvider.LMSTUDIO:
                return new LMStudioService(settings.lmStudioBaseUrl);
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
                return new LlamaCppService(settings.llama_cpp_execution_mode);
            case LLMProvider.OPENAI:
                if (!settings.openai?.api?.key) {
                    throw new Error("OpenAI API key is required");
                }
                return new OpenAIService(
                    settings.openai.api.key,
                    settings.models.conversation.openai || "gpt-3.5-turbo",
                    settings.models.embeddings.openai || "text-embedding-ada-002"
                );
            case LLMProvider.OPENROUTER:
                if (!settings.openrouter?.api?.key) {
                    throw new Error("OpenRouter API key is required");
                }
                return new OpenAIService(
                    settings.openrouter.api.key,
                    settings.models.conversation.openrouter || "gpt-3.5-turbo",
                    undefined,
                    "https://openrouter.ai/api/v1"
                );
            default:
                throw new Error(`Unsupported chat provider: ${settings.providers.chat}`);
        }
    }
}
