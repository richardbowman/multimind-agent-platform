import { ILLMService } from "./ILLMService";
import LMStudioService from "./lmstudioService";
import { BedrockService } from "./BedrockService";

export enum LLMProvider {
    LMSTUDIO = "lmstudio",
    BEDROCK = "bedrock"
}

export class LLMServiceFactory {
    static createService(provider: LLMProvider): ILLMService {
        switch (provider) {
            case LLMProvider.LMSTUDIO:
                return new LMStudioService();
            case LLMProvider.BEDROCK:
                const lmStudioService = new LMStudioService();
                return new BedrockService("anthropic.claude-v2", lmStudioService);
            default:
                throw new Error(`Unsupported LLM provider: ${provider}`);
        }
    }
}
