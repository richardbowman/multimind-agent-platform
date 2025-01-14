import { ClientSettings } from './settingsDecorators';

export class BedrockConfig {
    @ClientSettings({
        label: 'Bedrock Max Tokens/Min',
        category: 'Rate Limiting',
        type: 'number',
        defaultValue: 20000
    })
    maxTokensPerMinute: number = 20000;

    @ClientSettings({
        label: 'Bedrock Default Delay (ms)',
        category: 'Rate Limiting',
        type: 'number',
        defaultValue: 1000
    })
    defaultDelayMs: number = 1000;

    @ClientSettings({
        label: 'Bedrock Window Size (ms)',
        category: 'Rate Limiting',
        type: 'number',
        defaultValue: 60000
    })
    windowSizeMs: number = 60000;
}


export class DuckDuckGoConfig {
    @ClientSettings({
        label: 'DuckDuckGo Headless Mode',
        category: 'Search Settings',
        type: 'boolean',
        defaultValue: true,
        description: 'Run DuckDuckGo searches in headless browser mode'
    })
    headless: boolean = true;

    @ClientSettings({
        label: 'DuckDuckGo Timeout (ms)',
        category: 'Search Settings',
        type: 'number',
        defaultValue: 30000,
        description: 'Timeout for DuckDuckGo search operations'
    })
    timeout: number = 30000;
}
export class BraveConfig {
    @ClientSettings({
        label: 'Brave Search API Key',
        category: 'Search Settings',
        type: 'string',
        sensitive: true,
        description: 'API key for Brave Search'
    })
    apiKey: string = '';

    @ClientSettings({
        label: 'Brave Search Endpoint',
        category: 'Search Settings',
        type: 'string',
        defaultValue: 'https://api.search.brave.com/res/v1/web/search',
        description: 'API endpoint for Brave Search'
    })
    endpoint: string = 'https://api.search.brave.com/res/v1/web/search';
}

export class EmbeddingsModelByProvider {
    @ClientSettings({
        label: 'OpenAI Embeddings Model',
        category: 'Embeddings',
        type: 'string',
        description: 'Model identifier for OpenAI embeddings',
        defaultValue: 'text-embedding-3-small'
    })
    openai: string = 'text-embedding-3-small';

    @ClientSettings({
        label: 'Cohere Embeddings Model',
        category: 'Embeddings',
        type: 'string',
        description: 'Model identifier for Cohere embeddings',
        defaultValue: 'embed-english-v3.0'
    })
    cohere: string = 'embed-english-v3.0';

    @ClientSettings({
        label: 'HuggingFace Embeddings Model',
        category: 'Embeddings',
        type: 'string',
        description: 'Model identifier for HuggingFace embeddings'
    })
    huggingface: string = '';

    @ClientSettings({
        label: 'Local Embeddings Model',
        category: 'Embeddings',
        type: 'string',
        description: 'Model path for local embeddings'
    })
    local: string = '';

    @ClientSettings({
        label: 'Llama.cpp Embeddings Model',
        category: 'Embeddings',
        type: 'string',
        description: 'Model path for Llama.cpp embeddings'
    })
    llama_cpp: string = '';
}

export class ModelByProvider {
    @ClientSettings({
        label: 'LM Studio Model',
        category: 'LLM Settings',
        type: 'string',
        description: 'Model path or identifier for LM Studio'
    })
    lmstudio: string = 'qwen2.5-coder-14b-instruct';

    @ClientSettings({
        label: 'Anthropic Model',
        category: 'LLM Settings',
        type: 'string',
        description: 'Model identifier for Anthropic'
    })
    anthropic: string = 'claude-3-opus-20240229';

    @ClientSettings({
        label: 'Bedrock Model',
        category: 'LLM Settings',
        type: 'string',
        description: 'Model identifier for AWS Bedrock'
    })
    bedrock: string = 'anthropic.claude-3-sonnet-20240229-v1:0';

    @ClientSettings({
        label: 'OpenAI Model',
        category: 'LLM Settings',
        type: 'string',
        description: 'Model identifier for OpenAI'
    })
    openai: string = 'gpt-4-turbo-preview';

    @ClientSettings({
        label: 'OpenRouter Model',
        category: 'LLM Settings',
        type: 'string',
        description: 'Model identifier for OpenRouter'
    })
    openrouter: string = 'anthropic/claude-3-opus';

    @ClientSettings({
        label: 'Llama.cpp Model',
        category: 'LLM Settings',
        type: 'string',
        description: 'Model path for Llama.cpp'
    })
    llama_cpp: string = 'codellama-13b-instruct.Q4_K_M.gguf';
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
    chat: string = 'lmstudio';

    @ClientSettings({
        label: 'Embeddings Provider',
        category: 'LLM Settings',
        type: 'select',
        options: ['openai', 'cohere', 'huggingface', 'local', 'llama_cpp'],
        defaultValue: 'local'
    })
    embeddings: string = 'llama_cpp';
}

export class LLMModels {
    @ClientSettings({
        label: 'Conversation Models',
        category: 'LLM Settings',
        type: 'section',
        description: 'Models for conversation tasks'
    })
    conversation: ModelByProvider = new ModelByProvider();

    @ClientSettings({
        label: 'Reasoning Models',
        category: 'LLM Settings',
        type: 'section',
        description: 'Models for reasoning tasks'
    })
    reasoning: ModelByProvider = new ModelByProvider();

    @ClientSettings({
        label: 'Document Models',
        category: 'LLM Settings',
        type: 'section',
        description: 'Models for document processing tasks'
    })
    document: ModelByProvider = new ModelByProvider();
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
    api: APIConfig = new APIConfig();

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
        label: 'Embeddings Models',
        category: 'Embeddings',
        type: 'string',
        description: 'Model configurations for embeddings'
    })
    embeddingsModels: EmbeddingsModelByProvider = new EmbeddingsModelByProvider();

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
    port: number = 4001;
    protocol: string = 'ws';
    wsUrl: string = 'ws://localhost:4001';

    @ClientSettings({
        label: 'Models',
        category: 'LLM Settings',
        type: 'section',
        description: 'Model configurations for different tasks'
    })
    models: LLMModels = new LLMModels();

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
        type: 'section',
        sensitive: true
    })
    anthropic: ProviderConfig = new ProviderConfig();

    @ClientSettings({
        label: 'OpenAI Configuration',
        category: 'API Keys',
        type: 'section',
        sensitive: true
    })
    openai: ProviderConfig = new ProviderConfig();

    @ClientSettings({
        label: 'OpenRouter Configuration',
        category: 'API Keys',
        type: 'section',
        sensitive: true
    })
    openrouter: ProviderConfig = new ProviderConfig();

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
        type: 'section'
    })
    duckduckgo: DuckDuckGoConfig = new DuckDuckGoConfig();


    @ClientSettings({
        label: 'Brave Search Settings',
        category: 'Search Settings',
        type: 'section'
    })
    brave: BraveConfig = new BraveConfig();

    // Channel configuration
    defaultChannels!: Record<string, string>;

    // Agent configuration
    agents!: {
        [key: string]: AgentDefinition
    };

    @ClientSettings({
        label: 'Bedrock Settings',
        category: 'Rate Limiting',
        type: 'section'
    })
    bedrock: BedrockConfig = new BedrockConfig();
}
