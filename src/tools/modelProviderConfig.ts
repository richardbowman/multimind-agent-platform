import { ClientSettings } from './settingsDecorators';

export const appDefaultModelConfigs = [
    {
        type: 'conversation',
        provider: 'openrouter',
        model: 'google/gemini-2.0-flash-001',
        baseUrl: '',
        maxTokensPerMinute: 20000,
        defaultDelayMs: 1000,
        windowSizeMs: 60000
    }
];

export class ModelByProvider {
    @ClientSettings({
        label: 'LM Studio Model',
        category: 'LLM Settings',
        type: 'select',
        description: 'Model path or identifier for LM Studio'
    })
    lmstudio: string = 'qwen2.5-coder-14b-instruct';

    @ClientSettings({
        label: 'Anthropic Model',
        category: 'LLM Settings',
        type: 'select',
        description: 'Model identifier for Anthropic'
    })
    anthropic: string = 'claude-3-5-sonnet-20241022';

    @ClientSettings({
        label: 'Bedrock Model',
        category: 'LLM Settings',
        type: 'select',
        description: 'Model identifier for AWS Bedrock'
    })
    bedrock: string = 'anthropic.claude-3-sonnet-20240229-v1:0';

    @ClientSettings({
        label: 'OpenAI Model',
        category: 'LLM Settings',
        type: 'select',
        description: 'Model identifier for OpenAI'
    })
    openai: string = 'gpt-4-turbo-preview';

    @ClientSettings({
        label: 'OpenRouter Model',
        category: 'LLM Settings',
        type: 'select',
        description: 'Model identifier for OpenRouter'
    })
    openrouter: string = 'qwen/qwen-2.5-72b-instruct';

    @ClientSettings({
        label: 'DeepSeek Model',
        category: 'LLM Settings',
        type: 'select',
        description: 'Model identifier for DeepSeek',
    })
    deepseek: string = 'deepseek-chat';

    @ClientSettings({
        label: 'GitHub Model',
        category: 'LLM Settings',
        type: 'select',
        description: 'Model identifier for GitHub Models'
    })
    github: string = 'gpt-4';

    @ClientSettings({
        label: 'Llama.cpp Model',
        category: 'LLM Settings',
        type: 'select',
        description: 'Model path for Llama.cpp'
    })
    llama_cpp: string = 'MaziyarPanahi/Qwen2-1.5B-Instruct-GGUF/Qwen2-1.5B-Instruct.Q4_K_S.gguf';

    @ClientSettings({
        label: 'Advanced Reasoning Model',
        category: 'LLM Settings',
        type: 'select',
        description: 'Model for complex reasoning and problem solving tasks'
    })
    advancedReasoning: string = 'anthropic/claude-3-opus';
}

export const defaults = {
    'openrouter': {
        model: 'google/gemini-2.0-flash-001',
        baseUrl: '',
        maxTokensPerMinute: 20000,
        defaultDelayMs: 1000,
        windowSizeMs: 60000
    },
    'lmstudio': {
        baseUrl: 'ws://localhost:1234'
    }
}

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
