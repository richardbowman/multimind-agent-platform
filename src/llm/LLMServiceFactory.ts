import { IEmbeddingService, ILLMService } from "./ILLMService";
import LMStudioService from "./lmstudioService";
import { BedrockService } from "./BedrockService";
import { AnthropicService } from "./AnthropicService";
import { LlamaCppService } from "./LlamaCppService";
import { Settings } from "../tools/settings";
import { OpenAIService } from "./OpenAIService";
import { ConfigurationError } from "src/errors/ConfigurationError";
import { ModelProviderConfig } from "src/tools/modelProviderConfig";
import { LLMProvider } from "./types/LLMProvider";
import { ProviderConfig } from "src/tools/providerConfig";

export class LLMServiceFactory {
    static createEmbeddingService(settings: Settings, config: ProviderConfig): IEmbeddingService {
        switch (config.type) {
            case LLMProvider.LMSTUDIO:
                return new LMStudioService(config.baseUrl);
            case LLMProvider.BEDROCK:
                return new BedrockService(
                    undefined,
                    undefined
                );
            case LLMProvider.OPENAI:
                if (!config.key) {
                    throw new Error("OpenAI API key is required for embeddings");
                }
                return new OpenAIService(
                    config.key,
                    undefined,
                    undefined,
                    settings
                );
            case LLMProvider.LLAMA_CPP:
                return new LlamaCppService(config.llama_cpp_execution_mode);
            default:
                throw new Error(`Unsupported embedding provider: ${config.type}`);
        }
    }
    static createService(settings: Settings, config: ProviderConfig): ILLMService {
            // Create main chat service
        switch (config.type) {
            case LLMProvider.LMSTUDIO:
                return new LMStudioService(config.baseUrl);
            case LLMProvider.BEDROCK:
                return new BedrockService(
                    settings.models.conversation.bedrock,
                    settings.models.embeddings.bedrock
                );
            case LLMProvider.ANTHROPIC:
                return new AnthropicService(
                    config.key,
                    settings
                );
            case LLMProvider.LLAMA_CPP:
                return new LlamaCppService(config.llama_cpp_execution_mode);
            case LLMProvider.OPENAI:
                if (!config.key) {
                    throw new ConfigurationError("OpenAI API key is required");
                }
                return new OpenAIService(
                    config.key,
                    undefined,
                    undefined,
                    settings
                );
            case LLMProvider.OPENROUTER:
                if (!config.key) {
                    throw new ConfigurationError("OpenRouter API key is required");
                }
                return new OpenAIService(
                    config.key,
                    undefined,
                    config.baseUrl||"https://openrouter.ai/api/v1",
                    settings,
                    config.type
                );
            case LLMProvider.DEEPSEEK:
                if (!config.key) {
                    throw new ConfigurationError("DeepSeek API key is required");
                }
                return new OpenAIService(
                    config.key,
                    undefined,
                    config.baseUrl||"https://api.deepseek.com/v1",
                    settings,
                    config.type
                );
            case LLMProvider.GITHUB:
                if (!config.key) {
                    throw new ConfigurationError("GitHub API key is required");
                }
                return new OpenAIService(
                    config.key,
                    undefined,
                    "https://models.inference.ai.azure.com",
                    settings,
                    config.type
                );
            default:
                throw new ConfigurationError(`Unsupported chat provider: ${config.type}`);
        }
    }
}
