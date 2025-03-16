import { UUID } from 'src/types/uuid';
import { ClientSettings } from './settingsDecorators';
import { ChatHandle } from 'src/types/chatHandle';

export class BedrockConfig {
    @ClientSettings({
        label: 'Bedrock Max Tokens/Min',
        category: 'Rate Limiting',
        type: 'number'
    })
    maxTokensPerMinute: number = 20000;

    @ClientSettings({
        label: 'Bedrock Default Delay (ms)',
        category: 'Rate Limiting',
        type: 'number'
    })
    defaultDelayMs: number = 1000;

    @ClientSettings({
        label: 'Bedrock Window Size (ms)',
        category: 'Rate Limiting',
        type: 'number'
    })
    windowSizeMs: number = 60000;
}


export class PubMedConfig {
    @ClientSettings({
        label: 'PubMed Max Results',
        category: 'Search Settings',
        type: 'number',
        description: 'Maximum number of results to return from PubMed searches'
    })
    maxResults: number = 10;

    @ClientSettings({
        label: 'PubMed API Email',
        category: 'Search Settings',
        type: 'string',
        description: 'Email address for PubMed API (required for rate limit tracking)'
    })
    apiEmail: string = '';

    @ClientSettings({
        label: 'PubMed API Tool',
        category: 'Search Settings',
        type: 'string',
        description: 'Tool name for PubMed API (required for rate limit tracking)'
    })
    apiTool: string = 'YourAppName';
}

export class DuckDuckGoConfig {
    @ClientSettings({
        label: 'DuckDuckGo Headless Mode',
        category: 'Search Settings',
        type: 'boolean',
        description: 'Run DuckDuckGo searches in headless browser mode',
        visibleWhen: (settings: Settings) => settings.searchProvider === 'duckduckgo'
    })
    headless: boolean = true;

    @ClientSettings({
        label: 'DuckDuckGo Timeout (ms)',
        category: 'Search Settings',
        type: 'number',
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
        description: 'Model identifier for OpenAI embeddings'
    })
    openai: string = 'text-embedding-3-small';

    @ClientSettings({
        label: 'Llama.cpp Embeddings Model',
        category: 'Embeddings',
        type: 'select',
        description: 'Model path for Llama.cpp embeddings'
    })
    llama_cpp: string = 'nomic-ai/nomic-embed-text-v1.5-GGUF/nomic-embed-text-v1.5.Q4_K_M.gguf';

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

export enum PlannerType {
    NextStep = "nextStep"
}

export interface StepSequenceConfig {
    id: string;
    name: string;
    description?: string;
    steps: Array<{
        executor: string;
        description?: string;
        config?: Record<string, any>;
        interaction?: string;
    }>;
}

export interface AgentConfig {
    purpose: string;
    finalInstructions: string;
    supportsDelegation: boolean;
    plannerType: PlannerType;
    executors: {
        className: string;
        config?: Record<string, any>;
    }[];
    stepSequences?: StepSequenceConfig[];
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
        label: 'Advanced Reasoning Models',
        category: 'LLM Settings',
        type: 'section',
        description: 'Models for complex reasoning and problem solving tasks'
    })
    advancedReasoning: ModelByProvider = new ModelByProvider();

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
        options: ['lmstudio', 'anthropic', 'bedrock', 'openai', 'openrouter', 'llama_cpp', 'deepseek', 'github']
    })
    chat: string = 'openrouter';

    @ClientSettings({
        label: 'Embeddings Provider',
        category: 'Embeddings',
        type: 'select',
        options: ['openai', 'llama_cpp', 'lmstudio']
    })
    embeddings: string = 'llama_cpp';
}

export class LLMSettings {
    @ClientSettings({
        label: 'Context Size',
        category: 'LLM Settings',
        type: 'number'
    })
    contextSize: number = 16384;

    @ClientSettings({
        label: 'LM Studio Base URL',
        category: 'LLM Settings',
        type: 'string',
        visibleWhen: (settings: Settings) => settings.providers?.chat === 'lmstudio'
    })
    lmStudioBaseUrl: string = 'ws://localhost:1234';

}

export class AgentBuilderConfig {
    @ClientSettings({
        label: 'Agent Name',
        category: 'Agent Builder',
        type: 'string',
        required: true
    })
    name: string = '';

    @ClientSettings({
        label: 'Description',
        category: 'Agent Builder',
        type: 'string'
    })
    description: string = '';

    @ClientSettings({
        label: 'Purpose',
        category: 'Agent Builder',
        type: 'string',
        required: true
    })
    purpose: string = '';

    @ClientSettings({
        label: 'Final Instructions',
        category: 'Agent Builder',
        type: 'string',
        required: true
    })
    finalInstructions: string = '';

    @ClientSettings({
        label: 'Planner Type',
        category: 'Agent Builder',
        type: 'select',
        options: ['nextStep'],
        defaultValue: 'nextStep'
    })
    plannerType: PlannerType = PlannerType.NextStep;

    @ClientSettings({
        label: 'Auto Respond Channels',
        category: 'Agent Builder',
        type: 'string',
        description: 'Comma separated list of channel IDs to auto respond in'
    })
    autoRespondChannelIds: string = '';

    @ClientSettings({
        label: 'Enabled',
        category: 'Agent Builder',
        type: 'boolean',
        defaultValue: true
    })
    enabled: boolean = true;
}

export class TTSSettings {
    @ClientSettings({
        label: 'Voice ID',
        category: 'Text-to-Speech',
        type: 'select',
        options: [
            "ar_JO-kareem-low","ar_JO-kareem-medium","ca_ES-upc_ona-medium","ca_ES-upc_ona-x_low","ca_ES-upc_pau-x_low","cs_CZ-jirka-low","cs_CZ-jirka-medium","cy_GB-gwryw_gogleddol-medium","da_DK-talesyntese-medium","de_DE-eva_k-x_low","de_DE-karlsson-low","de_DE-kerstin-low","de_DE-mls-medium","de_DE-pavoque-low","de_DE-ramona-low","de_DE-thorsten-high","de_DE-thorsten-low","de_DE-thorsten-medium","de_DE-thorsten_emotional-medium","el_GR-rapunzelina-low","en_GB-alan-low","en_GB-alan-medium","en_GB-alba-medium","en_GB-aru-medium","en_GB-cori-high","en_GB-cori-medium","en_GB-jenny_dioco-medium","en_GB-northern_english_male-medium","en_GB-semaine-medium","en_GB-southern_english_female-low","en_GB-vctk-medium","en_US-amy-low","en_US-amy-medium","en_US-arctic-medium","en_US-bryce-medium","en_US-danny-low","en_US-hfc_female-medium","en_US-hfc_male-medium","en_US-joe-medium","en_US-john-medium","en_US-kathleen-low","en_US-kristin-medium","en_US-kusal-medium","en_US-l2arctic-medium","en_US-lessac-high","en_US-lessac-low","en_US-lessac-medium","en_US-libritts-high","en_US-libritts_r-medium","en_US-ljspeech-high","en_US-ljspeech-medium","en_US-norman-medium","en_US-ryan-high","en_US-ryan-low","en_US-ryan-medium","es_ES-carlfm-x_low","es_ES-davefx-medium","es_ES-mls_10246-low","es_ES-mls_9972-low","es_ES-sharvard-medium","es_MX-ald-medium","es_MX-claude-high","fa_IR-amir-medium","fa_IR-gyro-medium","fi_FI-harri-low","fi_FI-harri-medium","fr_FR-gilles-low","fr_FR-mls-medium","fr_FR-mls_1840-low","fr_FR-siwis-low","fr_FR-siwis-medium","fr_FR-tom-medium","fr_FR-upmc-medium","hu_HU-anna-medium","hu_HU-berta-medium","hu_HU-imre-medium","is_IS-bui-medium","is_IS-salka-medium","is_IS-steinn-medium","is_IS-ugla-medium","it_IT-paola-medium","it_IT-riccardo-x_low","ka_GE-natia-medium","kk_KZ-iseke-x_low","kk_KZ-issai-high","kk_KZ-raya-x_low","lb_LU-marylux-medium","ne_NP-google-medium","ne_NP-google-x_low","nl_BE-nathalie-medium","nl_BE-nathalie-x_low","nl_BE-rdh-medium","nl_BE-rdh-x_low","nl_NL-mls-medium","nl_NL-mls_5809-low","nl_NL-mls_7432-low","no_NO-talesyntese-medium","pl_PL-darkman-medium","pl_PL-gosia-medium","pl_PL-mc_speech-medium","pl_PL-mls_6892-low","pt_BR-edresson-low","pt_BR-faber-medium","pt_PT-tugão-medium","ro_RO-mihai-medium","ru_RU-denis-medium","ru_RU-dmitri-medium","ru_RU-irina-medium","ru_RU-ruslan-medium","sk_SK-lili-medium","sl_SI-artur-medium","sr_RS-serbski_institut-medium","sv_SE-nst-medium","sw_CD-lanfrica-medium","tr_TR-dfki-medium","tr_TR-fahrettin-medium","tr_TR-fettah-medium","uk_UA-lada-x_low","uk_UA-ukrainian_tts-medium","vi_VN-25hours_single-low","vi_VN-vais1000-medium","vi_VN-vivos-x_low","zh_CN-huayan-medium","zh_CN-huayan-x_low"
        ],
        description: 'Voice model to use for text-to-speech'
    })
    voiceId: string = 'en_US-amy-medium';

    @ClientSettings({
        label: 'Enable TTS',
        category: 'Text-to-Speech',
        type: 'boolean',
        description: 'Enable text-to-speech for incoming messages'
    })
    enabled: boolean = true;
}

export class Settings {
    @ClientSettings({
        label: 'Text-to-Speech',
        category: 'Text-to-Speech',
        type: 'section'
    })
    tts: TTSSettings = new TTSSettings();

    @ClientSettings({
        label: 'Agent Builder',
        category: 'Agent Builder',
        type: 'section'
    })
    agentBuilder: Record<string, AgentBuilderConfig> = {};

    scrapeTimeout(arg0: () => void, scrapeTimeout: any): void {
        throw new Error('Method not implemented.');
    }

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
        options: ['duckduckgo', 'searxng', 'google', 'brave']
    })
    searchProvider: string = 'duckduckgo';

    @ClientSettings({
        label: 'Scraping Provider',
        category: 'Search Settings',
        type: 'select',
        options: ['puppeteer', 'electron']
    })
    scrapingProvider: string = 'electron';

    @ClientSettings({
        label: 'SearXNG URL',
        category: 'Search Settings',
        type: 'string'
    })
    searxngUrl: string = 'http://localhost:8080/';

    @ClientSettings({
        label: 'ChromaDB URL',
        category: 'Vector DB',
        type: 'string'
    })
    chromadbUrl: string = 'http://localhost:8001';

    @ClientSettings({
        label: 'Chroma Collection',
        category: 'Vector DB',
        type: 'string'
    })
    chromaCollection: string = 'webpage_scrapes';

    @ClientSettings({
        label: 'Max Link Selections',
        category: 'Search Settings',
        type: 'number'
    })
    maxSelectedLinks: number = 10;

    @ClientSettings({
        label: 'Max Follows',
        category: 'Search Settings',
        type: 'number'
    })
    maxFollows: number = 3;

    @ClientSettings({
        label: 'Max Research Requests',
        category: 'Search Settings',
        type: 'number'
    })
    maxResearchRequests: number = 3;

    @ClientSettings({
        label: 'Webpage Scrape Timeout (seconds)',
        category: 'Search Settings',
        type: 'number'
    })
    pageScrapeTimeout: number = 10;

    @ClientSettings({
        label: 'Display Scraping Browser',
        category: 'Search Settings',
        type: 'boolean'
    })
    displayScrapeBrowser: boolean = false;


    @ClientSettings({
        label: 'LLM Settings',
        category: 'LLM Settings',
        type: 'section',
        description: 'General LLM configuration settings'
    })
    llmSettings: LLMSettings = new LLMSettings();

    @ClientSettings({
        label: 'UI Zoom Level',
        category: 'UI Settings',
        type: 'slider',
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
        description: 'The host address for the server'
    })
    host: string = 'localhost';
    port: number = 4001;
    protocol: string = 'ws';
    wsUrl: string = 'ws://localhost:4001';

    @ClientSettings({
        label: 'Simulate Typing on Paste',
        category: 'UI Settings',
        type: 'boolean',
        description: 'Simulate typing when pasting text into the command input'
    })
    simulateTypingOnPaste: boolean = false;

    @ClientSettings({
        label: 'Open Dev Tools on Load',
        category: 'UI Settings',
        type: 'boolean',
        description: 'Automatically open developer tools when window loads'
    })
    openDevToolsOnLoad: boolean = false;

    @ClientSettings({
        label: 'Models',
        category: 'LLM Settings',
        type: 'section',
        description: 'Model configurations for different tasks',
        customComponent: 'ModelSelector'
    })
    models: LLMModels = new LLMModels();

    @ClientSettings({
        label: 'Llama.cpp Execution Mode',
        category: 'LLM Settings',
        type: 'select',
        options: ['Auto', 'CPU-only'],
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

    @ClientSettings({
        label: 'GitHub Configuration',
        category: 'API Keys',
        type: 'section',
        sensitive: true
    })
    github: ProviderConfig = new ProviderConfig();

    // Rate Limiting
    @ClientSettings({
        label: 'Anthropic Max Tokens/Min',
        category: 'Rate Limiting',
        type: 'number'
    })
    anthropicMaxTokensPerMinute!: number;

    @ClientSettings({
        label: 'Anthropic Default Delay (ms)',
        category: 'Rate Limiting',
        type: 'number'
    })
    anthropicDefaultDelayMs!: number;

    @ClientSettings({
        label: 'Anthropic Window Size (ms)',
        category: 'Rate Limiting',
        type: 'number'
    })
    anthropicWindowSizeMs!: number;


    // Vector DB Settings
    @ClientSettings({
        label: 'Vector Database Type',
        category: 'Vector DB',
        type: 'select',
        options: ['vectra', 'chroma', 'sqlite_vec'],
        description: 'Type of vector database to use for storing and querying embeddings'
    })
    vectorDatabaseType: string = 'sqlite_vec';

    @ClientSettings({
        label: 'SQLiteVec Settings',
        category: 'Vector DB',
        type: 'section',
        description: 'Configuration for SQLiteVec vector database'
    })
    sqliteVec: {
        @ClientSettings({
            label: 'Embedding Dimensions',
            category: 'Vector DB',
            type: 'number',
            description: 'Number of dimensions for embeddings (must match embedding model)'
        })
        dimensions: number = 768;

        @ClientSettings({
            label: 'Auto Vacuum',
            category: 'Vector DB',
            type: 'boolean',
            description: 'Enable automatic database vacuuming to optimize storage'
        })
        autoVacuum: boolean = true;

        @ClientSettings({
            label: 'Journal Mode',
            category: 'Vector DB',
            type: 'select',
            options: ['DELETE', 'TRUNCATE', 'PERSIST', 'MEMORY', 'WAL', 'OFF'],
            description: 'SQLite journal mode (WAL recommended for better concurrency)'
        })
        journalMode: string = 'WAL';
    } = {
        dimensions: 768,
        autoVacuum: true,
        journalMode: 'WAL'
    };

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

    @ClientSettings({
        label: 'PubMed Settings',
        category: 'Search Settings',
        type: 'section'
    })
    pubmed: PubMedConfig = new PubMedConfig();

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
