import { BackendServices } from "../types/BackendServices";
import { ClientMethods, ServerMethods } from "../web/client/src/shared/RPCInterface";
import Logger from "../helpers/logger";
import { getUISettings } from "../helpers/config";
import { ChatPost } from "../chat/chatClient";
import { ClientChannel, ClientMessage, ClientThread } from "../web/client/src/shared/IPCInterface";
import { LLMCallLogger } from "../llm/LLMLogger";

export class StartupHandler implements Partial<ServerMethods> {
    createWrapper(): ServerMethods {
        const handler = this;
        return new Proxy({} as ServerMethods, {
            get(target, prop) {
                if (typeof handler[prop as keyof ServerMethods] === 'function') {
                    return async (...args: any[]) => {
                        try {
                            const result = await (handler[prop as keyof ServerMethods] as Function).apply(handler, args);
                            return result;
                        } catch (error) {
                            Logger.error(`Error in wrapped handler method ${String(prop)}:`, error);
                            throw error;
                        }
                    };
                }
                return undefined;
            }
        });
    }

    constructor() {
    }

    async getSettings(): Promise<any> {
        return getUISettings();
    }

    async updateSettings(settings: any): Promise<any> {
        console.log('update settings called');
        
        // Update environment variables based on settings
        if (settings.llmProvider) process.env.LLM_PROVIDER = settings.llmProvider;
        if (settings.chatModel) process.env.CHAT_MODEL = settings.chatModel;
        if (settings.llmWeakModel) process.env.LLM_WEAK_MODEL = settings.llmWeakModel;
        if (settings.llmHeavyModel) process.env.LLM_HEAVY_MODEL = settings.llmHeavyModel;
        if (settings.lmstudioApiKey) process.env.LMSTUDIO_API_KEY = settings.lmstudioApiKey;
        if (settings.anthropicApiKey) process.env.ANTHROPIC_API_KEY = settings.anthropicApiKey;
        if (settings.anthropicMaxTokensPerMinute) process.env.ANTHROPIC_MAX_TOKENS_PER_MINUTE = settings.anthropicMaxTokensPerMinute.toString();
        if (settings.anthropicDefaultDelayMs) process.env.ANTHROPIC_DEFAULT_DELAY_MS = settings.anthropicDefaultDelayMs.toString();
        if (settings.bedrockMaxTokensPerMinute) process.env.BEDROCK_MAX_TOKENS_PER_MINUTE = settings.bedrockMaxTokensPerMinute.toString();
        if (settings.vectorDatabaseType) process.env.VECTOR_DATABASE_TYPE = settings.vectorDatabaseType;
        if (settings.chromadbUrl) process.env.CHROMADB_URL = settings.chromadbUrl;
        if (settings.host) process.env.HOST = settings.host;
        if (settings.port) process.env.PORT = settings.port.toString();
        if (settings.protocol) process.env.PROTOCOL = settings.protocol;

        // Signal that settings have changed and backend needs reinitialization
        return { 
            ...getUISettings(),
            needsRestart: true
        };
    }
}
