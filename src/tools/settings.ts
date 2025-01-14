import { ClientSettings } from './settingsDecorators';

export class ModelByProvider {
    @ClientSettings({
        label: 'LM Studio Model',
        category: 'LLM Settings',
        type: 'string',
        description: 'Model path or identifier for LM Studio'
    })
    lmstudio!: string;

    @ClientSettings({
        label: 'Anthropic Model',
        category: 'LLM Settings',
        type: 'string',
        description: 'Model identifier for Anthropic'
    })
    anthropic!: string;

    @ClientSettings({
        label: 'Bedrock Model',
        category: 'LLM Settings',
        type: 'string',
        description: 'Model identifier for AWS Bedrock'
    })
    bedrock!: string;

    @ClientSettings({
        label: 'OpenAI Model',
        category: 'LLM Settings',
        type: 'string',
        description: 'Model identifier for OpenAI'
    })
    openai!: string;

    @ClientSettings({
        label: 'OpenRouter Model',
        category: 'LLM Settings',
        type: 'string',
        description: 'Model identifier for OpenRouter'
    })
    openrouter!: string;

    @ClientSettings({
        label: 'Llama.cpp Model',
        category: 'LLM Settings',
        type: 'string',
        description: 'Model path for Llama.cpp'
    })
    llama_cpp!: string;
}

export interface AgentConfig {
    purpose: string;
    finalInstructions: string;
    executors: {
        className: string;
        config?: Record<string, any>;
    }[];
}

export class LLMProviders {
    @ClientSettings({
        label: 'Chat Provider',
        category: 'LLM Settings',
        type: 'select',
        options: ['lmstudio', 'anthropic', 'bedrock', 'openai', 'openrouter', 'llama_cpp'],
        defaultValue: 'lmstudio'
    })
    chat!: string;

    @ClientSettings({
        label: 'Embeddings Provider',
        category: 'LLM Settings',
        type: 'select',
        options: ['openai', 'cohere', 'huggingface', 'local', 'llama_cpp'],
        defaultValue: 'local'
    })
    embeddings!: string;
}

export class LLMModels {
    @ClientSettings({
        label: 'Conversation Models',
        category: 'LLM Settings',
        type: 'string',
        description: 'Models for conversation tasks'
    })
    conversation!: ModelByProvider;

    @ClientSettings({
        label: 'Reasoning Models',
        category: 'LLM Settings',
        type: 'string',
        description: 'Models for reasoning tasks'
    })
    reasoning!: ModelByProvider;

    @ClientSettings({
        label: 'Document Models',
        category: 'LLM Settings',
        type: 'string',
        description: 'Models for document processing tasks'
    })
    document!: ModelByProvider;
}

export class APIConfig {
    @ClientSettings({
        label: 'API Key',
        category: 'API Keys',
        type: 'string',
        sensitive: true
    })
    key!: string;
}

export class ProviderConfig {
    api!: APIConfig;

    @ClientSettings({
        label: 'Model',
        category: 'API Keys',
        type: 'string'
    })
    model!: string;
}

interface AgentDefinition {
    className: string;
    sourcePath: string;
    userId: string;
    handle?: string;
    description?: string;
    enabled: boolean;
    config?: AgentConfig;
    autoRespondChannelIds?: String[];
}

export class Settings {
    @ClientSettings({
        label: 'UI Zoom Level',
        category: 'UI Settings',
        type: 'number',
        defaultValue: 1.0,
        min: 0.5,
        max: 2.0,
        step: 0.1,
        description: 'Adjust the UI zoom level (0.5 = 50%, 1.0 = 100%, 2.0 = 200%)'
    })
    zoom: number = 1.0;

    @ClientSettings({
        label: 'Server Host',
        category: 'Server Settings',
        type: 'string',
        defaultValue: 'localhost',
        description: 'The host address for the server'
    })
    host: string = 'localhost';
    port!: number;
    protocol!: string;
    wsUrl!: string;

    @ClientSettings({
        label: 'Models',
        category: 'LLM Settings',
        type: 'string',
        description: 'Model configurations for different tasks'
    })
    models!: {
        conversation: ModelByProvider,
        reasoning: ModelByProvider,
        document: ModelByProvider
    };

    @ClientSettings({
        label: 'Embedding Model',
        category: 'Embeddings',
        type: 'string',
        description: 'Model identifier for embeddings'
    })
    embeddingModel!: string;

    @ClientSettings({
        label: 'Embedding Provider',
        category: 'Embeddings',
        type: 'select',
        options: ['openai', 'cohere', 'huggingface', 'local', 'llama_cpp'],
        defaultValue: 'local'
    })
    embeddingProvider!: string;

    @ClientSettings({
        label: 'LM Studio Base URL',
        category: 'LLM Settings',
        type: 'string',
        description: 'Base URL for LM Studio API'
    })
    lmStudioBaseUrl!: string;

    @ClientSettings({
        label: 'Context Size',
        category: 'LLM Settings',
        type: 'number',
        description: 'Maximum context size in tokens'
    })
    contextSize!: number;

    // API Keys
    @ClientSettings({
        label: 'Anthropic Configuration',
        category: 'API Keys',
        type: 'string',
        sensitive: true
    })
    anthropic!: ProviderConfig;

    @ClientSettings({
        label: 'OpenAI Configuration',
        category: 'API Keys',
        type: 'string',
        sensitive: true
    })
    openai!: ProviderConfig;

    @ClientSettings({
        label: 'OpenRouter Configuration',
        category: 'API Keys',
        type: 'string',
        sensitive: true
    })
    openrouter!: ProviderConfig;

    // Rate Limiting
    @ClientSettings({
        label: 'Anthropic Max Tokens/Min',
        category: 'Rate Limiting',
        type: 'number',
        defaultValue: 50000
    })
    anthropicMaxTokensPerMinute!: number;

    @ClientSettings({
        label: 'Anthropic Default Delay (ms)',
        category: 'Rate Limiting',
        type: 'number',
        defaultValue: 1000
    })
    anthropicDefaultDelayMs!: number;

    @ClientSettings({
        label: 'Anthropic Window Size (ms)',
        category: 'Rate Limiting',
        type: 'number',
        defaultValue: 60000
    })
    anthropicWindowSizeMs!: number;

    @ClientSettings({
        label: 'Bedrock Max Tokens/Min',
        category: 'Rate Limiting',
        type: 'number',
        defaultValue: 50000
    })
    bedrockMaxTokensPerMinute!: number;

    @ClientSettings({
        label: 'Bedrock Default Delay (ms)',
        category: 'Rate Limiting',
        type: 'number',
        defaultValue: 1000
    })
    bedrockDefaultDelayMs!: number;

    @ClientSettings({
        label: 'Bedrock Window Size (ms)',
        category: 'Rate Limiting',
        type: 'number',
        defaultValue: 60000
    })
    bedrockWindowSizeMs!: number;

    // Vector DB Settings
    @ClientSettings({
        label: 'Vector Database Type',
        category: 'Vector DB',
        type: 'select',
        options: ['vectra', 'chroma'],
        defaultValue: 'vectra'
    })
    vectorDatabaseType!: string;

    @ClientSettings({
        label: 'ChromaDB URL',
        category: 'Vector DB',
        type: 'string'
    })
    chromadbUrl!: string;

    @ClientSettings({
        label: 'Chroma Collection',
        category: 'Vector DB',
        type: 'string'
    })
    chromaCollection!: string;

    // Search Settings
    @ClientSettings({
        label: 'Search Provider',
        category: 'Search Settings',
        type: 'select',
        options: ['duckduckgo', 'searxng', 'google', 'brave'],
        defaultValue: 'duckduckgo'
    })
    searchProvider!: 'duckduckgo' | 'searxng' | 'google' | 'brave';

    @ClientSettings({
        label: 'Scraping Provider',
        category: 'Search Settings',
        type: 'select',
        options: ['puppeteer', 'electron'],
        defaultValue: 'puppeteer'
    })
    scrapingProvider!: 'puppeteer' | 'electron';

    @ClientSettings({
        label: 'Max Searches',
        category: 'Search Settings',
        type: 'number',
        defaultValue: 3
    })
    maxSearches!: number;

    @ClientSettings({
        label: 'SearXNG URL',
        category: 'Search Settings',
        type: 'string'
    })
    searxngUrl!: string;

    @ClientSettings({
        label: 'Max Follows',
        category: 'Search Settings',
        type: 'number',
        defaultValue: 3
    })
    maxFollows!: number;

    @ClientSettings({
        label: 'Max Research Requests',
        category: 'Search Settings',
        type: 'number',
        defaultValue: 5
    })
    maxResearchRequests!: number;

    @ClientSettings({
        label: 'DuckDuckGo Settings',
        category: 'Search Settings',
        type: 'string'
    })
    duckduckgo!: {
        headless: boolean;
        timeout: number;
    };

    @ClientSettings({
        label: 'Brave Search Settings',
        category: 'Search Settings',
        type: 'string'
    })
    brave!: {
        apiKey: string;
        endpoint: string;
    };

    // Channel configuration
    defaultChannels!: Record<string, string>;
    
    // Agent configuration
    agents!: {
        [key: string]: AgentDefinition 
    };

    // Bedrock specific settings
    bedrock!: {
        maxTokensPerMinute: number;
        defaultDelayMs: number;
        windowSizeMs: number;
    };
}
