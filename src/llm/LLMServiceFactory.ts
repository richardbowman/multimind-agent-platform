import { ILLMService } from "./ILLMService";
import LMStudioService from "./lmstudioService";
import { BedrockService } from "./BedrockService";
import { AnthropicService } from "./AnthropicService";
import { LlamaCppService } from "./LlamaCppService";
import { Settings } from "../tools/settingsManager";

export enum LLMProvider {
    LMSTUDIO = "lmstudio",
    BEDROCK = "bedrock",
    ANTHROPIC = "anthropic",
    LLAMA_CPP = "llama-cpp",
    OPENAI = "openai",
    OPENROUTER = "openrouter"
}


export class LLMServiceFactory {
    static createService(settings: Settings): ILLMService {
        // Create embedding service if specified
        let embeddingService: ILLMService | undefined;
        if (settings.embeddingProvider && settings.embeddingProvider !== settings.providers.chat) {
            switch (settings.embeddingProvider) {
                case LLMProvider.LMSTUDIO:
                    embeddingService = new LMStudioService();
                    break;
                case LLMProvider.BEDROCK:
                    embeddingService = new BedrockService(
                        settings.chatModel,
                        settings.embeddingModel
                    );
                    break;
                default:
                    throw new Error(`Unsupported embedding provider: ${settings.embeddingProvider}`);
            }
        }

        // Create main chat service
        switch (settings.providers.chat) {
            case LLMProvider.LMSTUDIO:
                return new LMStudioService();
            case LLMProvider.BEDROCK:
                return new BedrockService(
                    settings.modelId || settings.llmWeakModel,
                    settings.embeddingModelId,
                    embeddingService
                );
            case LLMProvider.ANTHROPIC:
                if (!embeddingService) {
                    throw new Error("Anthropic requires an embedding service to be configured");
                }
                return new AnthropicService(
                    settings.anthropic.api.key, // Will use default from config if undefined
                    settings.modelId, // Will use default from config if undefined
                    embeddingService
                );
            case LLMProvider.LLAMA_CPP:
                return new LlamaCppService();
            case LLMProvider.OPENAI:
                if (!settings.openai?.api?.key) {
                    throw new Error("OpenAI API key is required");
                }
                return new OpenAIService(
                    settings.openai.api.key,
                    settings.modelId || "gpt-3.5-turbo",
                    settings.embeddingModelId || "text-embedding-ada-002"
                );
            case LLMProvider.OPENROUTER:
                if (!settings.openrouter?.api?.key) {
                    throw new Error("OpenRouter API key is required");
                }
                return new OpenAIService(
                    settings.openrouter.api.key,
                    settings.modelId || "gpt-3.5-turbo",
                    settings.embeddingModelId || "text-embedding-ada-002"
                ).setBaseUrl("https://openrouter.ai/api/v1");
            default:
                throw new Error(`Unsupported chat provider: ${settings.chatProvider}`);
        }
    }
}
