import { ILLMService } from "./ILLMService";
import LMStudioService from "./lmstudioService";
import { BedrockService } from "./BedrockService";
import { AnthropicService } from "./AnthropicService";
import { LLM_HEAVY_MODEL, LLM_WEAK_MODEL } from "src/helpers/config";

export enum LLMProvider {
    LMSTUDIO = "lmstudio",
    BEDROCK = "bedrock",
    ANTHROPIC = "anthropic"
}

export interface LLMServiceConfig {
    chatProvider: LLMProvider;
    embeddingProvider?: LLMProvider;
    modelId?: string;
    embeddingModelId?: string;
    apiKey?: string;
}

export class LLMServiceFactory {
    static createService(config: LLMServiceConfig): ILLMService {
        // Create embedding service if specified
        let embeddingService: ILLMService | undefined;
        if (config.embeddingProvider && config.embeddingProvider !== config.chatProvider) {
            switch (config.embeddingProvider) {
                case LLMProvider.LMSTUDIO:
                    embeddingService = new LMStudioService();
                    break;
                case LLMProvider.BEDROCK:
                    embeddingService = new BedrockService(
                        "",
                        config.embeddingModelId
                    );
                    break;
                default:
                    throw new Error(`Unsupported embedding provider: ${config.embeddingProvider}`);
            }
        }

        // Create main chat service
        switch (config.chatProvider) {
            case LLMProvider.LMSTUDIO:
                return new LMStudioService();
            case LLMProvider.BEDROCK:
                return new BedrockService(
                    config.modelId || LLM_WEAK_MODEL,
                    config.embeddingModelId,
                    embeddingService
                );
            case LLMProvider.ANTHROPIC:
                if (!embeddingService) {
                    throw new Error("Anthropic requires an embedding service to be configured");
                }
                return new AnthropicService(
                    config.apiKey, // Will use default from config if undefined
                    config.modelId, // Will use default from config if undefined
                    embeddingService
                );
            default:
                throw new Error(`Unsupported chat provider: ${config.chatProvider}`);
        }
    }
}
