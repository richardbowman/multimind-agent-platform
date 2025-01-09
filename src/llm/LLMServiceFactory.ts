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
    LLAMA_CPP = "llama-cpp"
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
            default:
                throw new Error(`Unsupported chat provider: ${settings.chatProvider}`);
        }
    }
}
