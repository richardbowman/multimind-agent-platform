import { ILLMService } from "./ILLMService";
import LMStudioService from "./lmstudioService";
import { BedrockService } from "./BedrockService";
import { config } from "../helpers/config";
import { LLM_HEAVY_MODEL, LLM_WEAK_MODEL } from "src/helpers/config";

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
                const modelId = LLM_WEAK_MODEL;
                if (!modelId) throw new Error("LM_HEAVY_MODEL not found in environment.");
                return new BedrockService(LLM_WEAK_MODEL, undefined, lmStudioService);
            default:
                throw new Error(`Unsupported LLM provider: ${provider}`);
        }
    }
}
