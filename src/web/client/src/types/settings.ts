export interface ConfigMetadata {
    key: string;           // Can include dots for nested properties e.g. "bedrock.maxTokensPerMinute"
    label: string;
    type: 'string' | 'number' | 'boolean' | 'select';
    category: string;
    description?: string;
    options?: string[];
    defaultValue?: any;
    sensitive?: boolean; // For API keys etc
    required?: boolean;  // Whether this field is required
}

export interface Settings extends Record<string, any> {
    [key: string]: string | number | boolean;
}

export const CONFIG_METADATA: ConfigMetadata[] = [
    // LLM Settings
    {
        key: 'providers.chat',
        label: 'LLM Provider',
        type: 'select',
        category: 'LLM Settings',
        options: ['lmstudio', 'anthropic', 'bedrock', 'openai', 'openrouter', 'llama-cpp'],
        defaultValue: 'lmstudio',
        required: true
    },
    {
        key: 'models.lmstudio',
        label: 'LM Studio Model',
        type: 'string',
        category: 'LLM Settings',
        description: 'Model path or identifier for LM Studio'
    },
    {
        key: 'models.anthropic',
        label: 'Anthropic Model',
        type: 'string',
        category: 'LLM Settings',
        description: 'Model identifier for Anthropic (e.g. claude-2.1)'
    },
    {
        key: 'models.bedrock',
        label: 'Bedrock Model',
        type: 'string',
        category: 'LLM Settings',
        description: 'Model identifier for AWS Bedrock'
    },
    {
        key: 'models.openai',
        label: 'OpenAI Model',
        type: 'string',
        category: 'LLM Settings',
        description: 'Model identifier for OpenAI (e.g. gpt-4)'
    },
    {
        key: 'models.openrouter',
        label: 'OpenRouter Model',
        type: 'string',
        category: 'LLM Settings',
        description: 'Model identifier for OpenRouter'
    },
    {
        key: 'models.llama_cpp',
        label: 'Llama.cpp Model',
        type: 'string',
        category: 'LLM Settings',
        description: 'Model path for Llama.cpp'
    },
    {
        key: 'llmWeakModel',
        label: 'Weak Model',
        type: 'string',
        category: 'LLM Settings'
    },
    {
        key: 'llmHeavyModel',
        label: 'Heavy Model',
        type: 'string',
        category: 'LLM Settings'
    },

    // API Keys
    {
        key: 'anthropic.api.key',
        label: 'Anthropic API Key',
        type: 'string',
        category: 'API Keys',
        sensitive: true
    },
    {
        key: 'openai.api.key',
        label: 'OpenAI API Key',
        type: 'string',
        category: 'API Keys',
        sensitive: true
    },
    {
        key: 'openrouter.api.key',
        label: 'OpenRouter API Key',
        type: 'string',
        category: 'API Keys',
        sensitive: true
    },

    // Rate Limiting
    {
        key: 'anthropicMaxTokensPerMinute',
        label: 'Anthropic Max Tokens/Min',
        type: 'number',
        category: 'Rate Limiting',
        defaultValue: 50000
    },
    {
        key: 'anthropicDefaultDelayMs',
        label: 'Anthropic Default Delay (ms)',
        type: 'number',
        category: 'Rate Limiting',
        defaultValue: 1000
    },
    {
        key: 'bedrockMaxTokensPerMinute',
        label: 'Bedrock Max Tokens/Min',
        type: 'number',
        category: 'Rate Limiting',
        defaultValue: 50000
    },

    // Vector DB Settings
    {
        key: 'vectorDatabaseType',
        label: 'Vector Database Type',
        type: 'select',
        category: 'Vector DB',
        options: ['vectra', 'chroma'],
        defaultValue: 'vectra'
    },
    {
        key: 'chromadbUrl',
        label: 'ChromaDB URL',
        type: 'string',
        category: 'Vector DB'
    }
];
