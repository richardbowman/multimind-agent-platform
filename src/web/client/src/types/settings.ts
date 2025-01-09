export interface ConfigMetadata {
    key: string;           // Can include dots for nested properties e.g. "bedrock.maxTokensPerMinute"
    label: string;
    type: 'string' | 'number' | 'boolean' | 'select';
    category: string;
    description?: string;
    options?: string[];
    defaultValue?: any;
    sensitive?: boolean; // For API keys etc
}

export interface Settings extends Record<string, any> {
    [key: string]: string | number | boolean;
}

export const CONFIG_METADATA: ConfigMetadata[] = [
    // LLM Settings
    {
        key: 'llmProvider',
        label: 'LLM Provider',
        type: 'select',
        category: 'LLM Settings',
        options: ['lmstudio', 'anthropic', 'bedrock'],
        defaultValue: 'lmstudio'
    },
    {
        key: 'chatModel',
        label: 'Chat Model',
        type: 'string',
        category: 'LLM Settings'
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
        key: 'anthropicApiKey',
        label: 'Anthropic API Key',
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
