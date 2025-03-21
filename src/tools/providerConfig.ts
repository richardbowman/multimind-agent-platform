import { APIConfig } from "./settings";
import { ClientSettings } from "./settingsDecorators";

export class ProviderConfig {
    api: APIConfig = new APIConfig();

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

export const PROVIDER_CONFIG_DEFAULT: ProviderConfig[] = [
    {
        id: 'openrouter-default',
        type: 'openrouter',
        baseUrl: 'https://openrouter.ai/api/v1',
        rateLimiting: {
            maxTokensPerMinute: 20000,
            defaultDelayMs: 1000,
            windowSizeMs: 60000
        }
    }
];