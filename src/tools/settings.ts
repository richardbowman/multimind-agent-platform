import { UUID } from 'src/types/uuid';
import { ClientSettings } from './settingsDecorators';
import { ChatHandle } from 'src/types/chatHandle';

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
        description: 'Run DuckDuckGo searches in headless browser mode',
        visibleWhen: (settings: Settings) => settings.searchProvider === 'duckduckgo'
    })
    headless: boolean = true;

    @ClientSettings({
        label: 'DuckDuckGo Timeout (ms)',
        category: 'Search Settings',
        type: 'number',
        defaultValue: 30000,
        description: 'Timeout for DuckDuckGo search operations',
        visibleWhen: (settings: Settings) => settings.searchProvider === 'duckduckgo'
    })
    timeout: number = 30000;
}
export class BraveConfig {
    @ClientSettings({
        label: 'Brave Search API Key',
        category: 'Search Settings',
        type: 'string',
        sensitive: true,
        description: 'API key for Brave Search',
        visibleWhen: (settings: Settings) => settings.searchProvider === 'brave'
    })
    apiKey: string = '';

    @ClientSettings({
        label: 'Brave Search Endpoint',
        category: 'Search Settings',
        type: 'string',
        defaultValue: 'https://api.search.brave.com/res/v1/web/search',
        description: 'API endpoint for Brave Search',
        visibleWhen: (settings: Settings) => settings.searchProvider === 'brave'
    })
    endpoint: string = 'https://api.search.brave.com/res/v1/web/search';
}

export class EmbeddingsModelByProvider {
    @ClientSettings({
        label: 'OpenAI Embeddings Model',
        category: 'Embeddings',
        type: 'select',
        description: 'Model identifier for OpenAI embeddings',
        defaultValue: 'text-embedding-3-small'
    })
    openai: string = 'text-embedding-3-small';

    @ClientSettings({
        label: 'Llama.cpp Embeddings Model',
        category: 'Embeddings',
        type: 'select',
        description: 'Model path for Llama.cpp embeddings'
    })
    llama_cpp: string = '';

    @ClientSettings({
        label: 'LM Studio Model',
        category: 'Embeddings',
        type: 'select',
        description: 'Model path or identifier for LM Studio'
    })
    lmstudio: string = 'text-embedding-nomic-embed-text-v1.5';
}

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
    anthropic: string = 'claude-3-opus-20240229';

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
    openrouter: string = 'anthropic/claude-3-opus';

    @ClientSettings({
        label: 'DeepSeek Model',
        category: 'LLM Settings',
        type: 'select',
        description: 'Model identifier for DeepSeek',
        defaultValue: 'deepseek-chat'
    })
    deepseek: string = 'deepseek-chat';

    @ClientSettings({
        label: 'Llama.cpp Model',
        category: 'LLM Settings',
        type: 'select',
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

    @ClientSettings({
        label: 'Embeddings Models',
        category: 'LLM Settings',
        type: 'section',
        description: 'Models for generating embeddings'
    })
    embeddings: EmbeddingsModelByProvider = new EmbeddingsModelByProvider();
}

export class APIConfig {
    @ClientSettings({
        label: 'API Key',
        category: 'API Keys',
        type: 'string',
        sensitive: true
    })
    key: string = "";
}

export class ProviderConfig {
    api: APIConfig = new APIConfig();
}

export interface AgentDefinition {
    className: string;
    sourcePath: string;
    userId: UUID;
    handle?: ChatHandle;
    description?: string;
    enabled: boolean;
    config?: AgentConfig;
    autoRespondChannelIds?: String[];
}

export class ProvidersConfig {
    @ClientSettings({
        label: 'Chat Provider',
        category: 'LLM Settings',
        type: 'select',
        options: ['lmstudio', 'anthropic', 'bedrock', 'openai', 'openrouter', 'llama_cpp', 'deepseek']
    })
    chat: string = 'llama_cpp';

    @ClientSettings({
        label: 'Embeddings Provider',
        category: 'Embeddings',
        type: 'select',
        options: ['openai', 'llama_cpp', 'lmstudio']
    })
    embeddings: string = 'llama_cpp';
}

export class Settings {

    @ClientSettings({
        label: 'Providers',
        category: 'LLM Settings',
        type: 'section'
    })
    providers: ProvidersConfig = new ProvidersConfig();

    @ClientSettings({
        label: 'Search Provider',
        category: 'Search Settings',
        type: 'select',
        options: ['duckduckgo', 'searxng', 'google', 'brave'],
        defaultValue: 'duckduckgo'
    })
    searchProvider: string = 'duckduckgo';

    @ClientSettings({
        label: 'Scraping Provider',
        category: 'Search Settings',
        type: 'select',
        options: ['puppeteer', 'electron'],
        defaultValue: 'electron'
    })
    scrapingProvider: string = 'electron';

    @ClientSettings({
        label: 'SearXNG URL',
        category: 'Search Settings',
        type: 'string',
        defaultValue: 'http://localhost:8080/'
    })
    searxngUrl: string = 'http://localhost:8080/';

    @ClientSettings({
        label: 'ChromaDB URL',
        category: 'Vector DB',
        type: 'string',
        defaultValue: 'http://localhost:8001'
    })
    chromadbUrl: string = 'http://localhost:8001';

    @ClientSettings({
        label: 'Chroma Collection',
        category: 'Vector DB',
        type: 'string',
        defaultValue: 'webpage_scrapes'
    })
    chromaCollection: string = 'webpage_scrapes';

    @ClientSettings({
        label: 'Max Searches',
        category: 'Search Settings',
        type: 'number',
        defaultValue: 3
    })
    maxSearches: number = 3;

    @ClientSettings({
        label: 'Max Follows',
        category: 'Search Settings',
        type: 'number',
        defaultValue: 3
    })
    maxFollows: number = 3;

    @ClientSettings({
        label: 'Max Research Requests',
        category: 'Search Settings',
        type: 'number',
        defaultValue: 3
    })
    maxResearchRequests: number = 3;

    @ClientSettings({
        label: 'Context Size',
        category: 'LLM Settings',
        type: 'number',
        defaultValue: 16384
    })
    contextSize: number = 16384;

    @ClientSettings({
        label: 'LM Studio Base URL',
        category: 'LLM Settings',
        type: 'string',
        defaultValue: 'ws://localhost:1234',
        visibleWhen: (settings: Settings) => settings.providers?.chat === 'lmstudio'
    })
    lmStudioBaseUrl: string = 'ws://localhost:1234';

    @ClientSettings({
        label: 'UI Zoom Level',
        category: 'UI Settings',
        type: 'slider',
        defaultValue: 1.0,
        min: 0.5,
        max: 2.0,
        step: 0.1,
        description: 'Adjust the UI zoom level (0.5 = 50%, 1.0 = 100%, 2.0 = 200%)'
    })
    zoom: number = 1.0;

    @ClientSettings({
        label: 'Window Width',
        category: 'UI Settings',
        type: 'slider',
        defaultValue: 1200,
        min: 800,
        max: 2560,
        step: 10,
        description: 'Default window width in pixels'
    })
    windowWidth: number = 1200;

    @ClientSettings({
        label: 'Window Height',
        category: 'UI Settings',
        type: 'slider',
        defaultValue: 800,
        min: 600,
        max: 1440,
        step: 10,
        description: 'Default window height in pixels'
    })
    windowHeight: number = 800;

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
        label: 'Llama.cpp Execution Mode',
        category: 'LLM Settings',
        type: 'select',
        options: ['Auto', 'CPU-only'],
        defaultValue: 'Auto',
        description: 'Execution mode for Llama.cpp (Auto uses GPU if available, CPU-only forces CPU execution)',
        visibleWhen: (settings: Settings) => 
            settings.providers?.chat === 'llama_cpp' || 
            settings.providers?.embeddings === 'llama_cpp'
    })
    llama_cpp_execution_mode: string = 'Auto';

    @ClientSettings({
        label: 'Tool Choice Behavior',
        category: 'LLM Settings',
        type: 'select',
        options: ['auto', 'required', 'none'],
        defaultValue: 'auto',
        description: 'Controls how the LLM handles tool calls (auto=LLM decides, required=must use tools, none=no tools)'
    })
    tool_choice: string = 'auto';

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

    @ClientSettings({
        label: 'DeepSeek Configuration',
        category: 'API Keys',
        type: 'section',
        sensitive: true
    })
    deepseek: ProviderConfig = new ProviderConfig();

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
