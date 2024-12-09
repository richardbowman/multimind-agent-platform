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
                return new BedrockService();
            default:
                throw new Error(`Unsupported LLM provider: ${provider}`);
        }
    }
}
