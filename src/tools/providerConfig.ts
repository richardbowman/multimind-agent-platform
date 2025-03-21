import { ClientSettings } from "./settingsDecorators";
import { LLMProvider } from "../llm/types/LLMProvider";
import { APIConfig } from "./settings";

export class ProviderConfig extends APIConfig {
    @ClientSettings({
        label: 'Provider Type',
        category: 'LLM Settings',
        type: 'select',
        options: Object.values(LLMProvider),
        description: 'Type of LLM provider to use'
    })
    type: LLMProvider = LLMProvider.OPENAI;

    @ClientSettings({
        label: 'Base URL', 
        category: 'LLM Settings',
        type: 'string',
        description: 'Custom API endpoint for the provider'
    })
    baseUrl: string = '';

    @ClientSettings({
        label: 'Max Tokens',
        category: 'Rate Limiting',
        type: 'number',
        description: 'Maximum tokens per minute for this provider'
    })
    maxTokensPerMinute: number = 20000;

    @ClientSettings({
        label: 'Default Delay (ms)',
        category: 'Rate Limiting',
        type: 'number',
        description: 'Default delay between requests'
    })
    defaultDelayMs: number = 1000;

    @ClientSettings({
        label: 'Window Size (ms)',
        category: 'Rate Limiting',
        type: 'number',
        description: 'Time window for rate limiting'
    })
    windowSizeMs: number = 60000;
}


export class LMStudioProviderConfig extends ProviderConfig {
    @ClientSettings({
        label: 'Llama.cpp Execution Mode',
        category: 'LLM Settings',
        type: 'select',
        options: ['Auto', 'CPU-only'],
        description: 'Execution mode for Llama.cpp (Auto uses GPU if available, CPU-only forces CPU execution)',
    })
    llama_cpp_execution_mode: string = 'Auto';
}

export const PROVIDER_CONFIG_DEFAULTS : Record<LLMProvider, ProviderConfig> = {
    [LLMProvider.ANTHROPIC]: {
        type: LLMProvider.ANTHROPIC,
        baseUrl: 'https://api.anthropic.com/v1'                                                                                      
    },
    [LLMProvider.OPENROUTER]: {
        type: LLMProvider.OPENROUTER,
        baseUrl: 'https://openrouter.ai/api/v1'                                                                                             
    },
    [LLMProvider.OPENAI]: {
        type: LLMProvider.OPENAI,
        baseUrl: 'https://api.openai.com/v1'                                                                                          
    },
    [LLMProvider.DEEPSEEK]: {
        type: LLMProvider.DEEPSEEK,
        baseUrl: 'https://api.deepseek.com/v1'                                                                                             
    },
    [LLMProvider.LMSTUDIO]: {
        type: LLMProvider.LMSTUDIO,
        baseUrl: 'http://127.0.0.1:1234'
    }
}

export const PROVIDER_CONFIG_DEFAULT: ProviderConfig[] = [
    {
        type: LLMProvider.OPENROUTER,
        baseUrl: 'https://openrouter.ai/api/v1',
        maxTokensPerMinute: 20000,
        defaultDelayMs: 1000,
        windowSizeMs: 60000,
        key: ''
    }
];
