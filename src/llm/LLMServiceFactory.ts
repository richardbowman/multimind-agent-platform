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

export class LLMServiceFactory {
    static createEmbeddingService(settings: Settings): IEmbeddingService {
        switch (settings.providers.embeddings) {
            case LLMProvider.LMSTUDIO:
                return new LMStudioService(settings.llmSettings.lmStudioBaseUrl);
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
                    settings.models.embeddings.openai || "text-embedding-ada-002",
                    settings
                );
            case LLMProvider.LLAMA_CPP:
                return new LlamaCppService(settings.llama_cpp_execution_mode);
            default:
                throw new Error(`Unsupported embedding provider: ${settings.providers.embeddings}`);
        }
    }
    static createService(settings: Settings, config: ModelProviderConfig): ILLMService {
            // Create main chat service
        switch (config.provider) {
            case LLMProvider.LMSTUDIO:
                return new LMStudioService(settings.llmSettings.lmStudioBaseUrl);
            case LLMProvider.BEDROCK:
                return new BedrockService(
                    settings.models.conversation.bedrock,
                    settings.models.embeddings.bedrock
                );
            case LLMProvider.ANTHROPIC:
                return new AnthropicService(
                    settings.anthropic.api.key,
                    config.model,
                    settings
                );
            case LLMProvider.LLAMA_CPP:
                return new LlamaCppService(settings.llama_cpp_execution_mode);
            case LLMProvider.OPENAI:
                if (!settings.openai?.api?.key) {
                    throw new ConfigurationError("OpenAI API key is required");
                }
                return new OpenAIService(
                    settings.openai.api.key,
                    settings.models.embeddings.openai || "text-embedding-ada-002",
                    undefined,
                    settings
                );
            case LLMProvider.OPENROUTER:
                if (!settings.openrouter?.api?.key) {
                    throw new ConfigurationError("OpenRouter API key is required");
                }
                return new OpenAIService(
                    settings.openrouter.api.key,
                    undefined,
                    "https://openrouter.ai/api/v1",
                    settings,
                    config.provider
                );
            case LLMProvider.DEEPSEEK:
                if (!settings.deepseek?.api?.key) {
                    throw new ConfigurationError("DeepSeek API key is required");
                }
                return new OpenAIService(
                    settings.deepseek?.api.key,
                    undefined,
                    "https://api.deepseek.com/v1",
                    settings,
                    config.provider
                );
            case LLMProvider.GITHUB:
                if (!settings.github?.api?.key) {
                    throw new ConfigurationError("GitHub API key is required");
                }
                return new OpenAIService(
                    settings.github.api.key,
                    undefined,
                    "https://models.inference.ai.azure.com",
                    settings,
                    config.provider
                );
            default:
                throw new ConfigurationError(`Unsupported chat provider: ${settings.providers.chat}`);
        }
    }
}
