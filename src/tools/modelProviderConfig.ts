import { ClientSettings } from './settingsDecorators';

export class ModelProviderConfig {
    @ClientSettings({
        label: 'Model Type',
        category: 'LLM Settings',
        type: 'select',
        options: ['conversation', 'reasoning', 'advancedReasoning', 'document', 'embeddings'],
        description: 'Type of model configuration'
    })
    type: string;

    @ClientSettings({
        label: 'Provider',
        category: 'LLM Settings',
        type: 'select',
        options: ['lmstudio', 'anthropic', 'bedrock', 'openai', 'openrouter', 'llama_cpp', 'deepseek', 'github']
    })
    provider: string = 'openrouter';

    @ClientSettings({
        label: 'Model',
        category: 'LLM Settings',
        type: 'select',
        description: 'Model identifier for the selected provider'
    })
    model: string = '';

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
