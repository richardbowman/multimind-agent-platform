import { ClientSettings } from "./settingsDecorators";
import { LLMProvider } from "../llm/types/LLMProvider";

export class ProviderConfig {
    @ClientSettings({
        label: 'Provider Type',
        category: 'Provider',
        type: 'select',
        options: Object.values(LLMProvider),
        description: 'Type of LLM provider to use',
        matchDefaults: true,
        showInList: true
    })
    type: LLMProvider = LLMProvider.OPENAI;

    @ClientSettings({
        label: 'API Key',
        category: 'API Keys',
        type: 'string',
        sensitive: true
    })
    key: string = "";

    @ClientSettings({
        label: 'Base URL', 
        category: 'LLM Settings',
        type: 'string',
        description: 'Custom API endpoint for the provider',
        showInList: true
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

    @ClientSettings({
        label: 'Llama.cpp Execution Mode',
        category: 'LLM Settings',
        type: 'select',
        options: ['Auto', 'CPU-only'],
        description: 'Execution mode for Llama.cpp (Auto uses GPU if available, CPU-only forces CPU execution)'
    })
    llama_cpp_execution_mode: 'Auto'|'CPU-only' = 'Auto';

    @ClientSettings({
        label: 'Tool Choice Behavior',
        category: 'LLM Settings',
        type: 'select',
        options: ['auto', 'required', 'none'],
        description: 'Controls how the LLM handles tool calls (auto=LLM decides, required=must use tools, none=no tools)'
    })
    tool_choice: string = 'auto';
}

export const PROVIDER_CONFIG_DEFAULTS = [
    {
        type: LLMProvider.ANTHROPIC,
        baseUrl: 'https://api.anthropic.com/v1'                                                                                      
    },
    {
        type: LLMProvider.OPENROUTER,
        baseUrl: 'https://openrouter.ai/api/v1'                                                                                             
    },
    {
        type: LLMProvider.OPENAI,
        baseUrl: 'https://api.openai.com/v1'                                                                                          
    },
    {
        type: LLMProvider.DEEPSEEK,
        baseUrl: 'https://api.deepseek.com/v1'                                                                                             
    },
    {
        type: LLMProvider.LMSTUDIO,
        baseUrl: 'ws://127.0.0.1:1234'
    }
];

export const PROVIDER_CONFIG_DEFAULT: Partial<ProviderConfig>[] = [
    {
        type: LLMProvider.OPENROUTER,
        baseUrl: 'https://openrouter.ai/api/v1',
        maxTokensPerMinute: 20000,
        defaultDelayMs: 1000,
        windowSizeMs: 60000,
        key: ''
    },
    {
        type: LLMProvider.LLAMA_CPP,
        llama_cpp_execution_mode: 'Auto',
        key: ''
    }
];
