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

    // LLM Provider settings
    providers!: {
        chat: string;
        embeddings: string;
    };

    models!: {
        conversation: ModelByProvider,
        reasoning: ModelByProvider,
        document: ModelByProvider
    };

    embeddingModel!: string;
    embeddingProvider!: string;
    lmStudioBaseUrl!: string;
    contextSize!: number;

    // API Keys
    anthropic!: ProviderConfig;
    openai!: ProviderConfig;
    openrouter!: ProviderConfig;

    // Rate Limiting
    anthropicMaxTokensPerMinute!: number;
    anthropicDefaultDelayMs!: number;
    anthropicWindowSizeMs!: number;
    bedrockMaxTokensPerMinute!: number;
    bedrockDefaultDelayMs!: number;
    bedrockWindowSizeMs!: number;

    // Vector DB Settings
    vectorDatabaseType!: string;
    chromadbUrl!: string;
    chromaCollection!: string;

    // Search Settings
    searchProvider!: 'duckduckgo' | 'searxng' | 'google' | 'brave';
    scrapingProvider!: 'puppeteer' | 'electron';
    maxSearches!: number;
    searxngUrl!: string;
    maxFollows!: number;
    maxResearchRequests!: number;
    duckduckgo!: {
        headless: boolean;
        timeout: number;
    };
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