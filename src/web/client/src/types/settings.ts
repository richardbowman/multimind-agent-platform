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

// Generate metadata from TypeScript annotations
function getConfigMetadata(settings: Settings): ConfigMetadata[] {
    const metadata: ConfigMetadata[] = [];
    
    // Example for zoom property
    metadata.push({
        key: 'zoom',
        label: 'UI Zoom Level',
        type: 'number',
        category: 'UI Settings',
        defaultValue: 1.0,
        min: 0.5,
        max: 2.0,
        step: 0.1,
        description: 'Adjust the UI zoom level'
    });

    // Add other properties here based on their annotations
    // ...

    return metadata;
}
    // Conversation Models
    {
        key: 'models.conversation.lmstudio',
        label: 'Conversation - LM Studio Model',
        type: 'string',
        category: 'LLM Settings',
        description: 'Model path or identifier for LM Studio (conversation)'
    },
    {
        key: 'models.conversation.anthropic',
        label: 'Conversation - Anthropic Model',
        type: 'string',
        category: 'LLM Settings',
        description: 'Model identifier for Anthropic (e.g. claude-2.1) (conversation)'
    },
    {
        key: 'models.conversation.bedrock',
        label: 'Conversation - Bedrock Model',
        type: 'string',
        category: 'LLM Settings',
        description: 'Model identifier for AWS Bedrock (conversation)'
    },
    {
        key: 'models.conversation.openai',
        label: 'Conversation - OpenAI Model',
        type: 'string',
        category: 'LLM Settings',
        description: 'Model identifier for OpenAI (e.g. gpt-4) (conversation)'
    },
    {
        key: 'models.conversation.openrouter',
        label: 'Conversation - OpenRouter Model',
        type: 'string',
        category: 'LLM Settings',
        description: 'Model identifier for OpenRouter (conversation)'
    },
    {
        key: 'models.conversation.llama_cpp',
        label: 'Conversation - Llama.cpp Model',
        type: 'string',
        category: 'LLM Settings',
        description: 'Model path for Llama.cpp (conversation)'
    },

    // Reasoning Models
    {
        key: 'models.reasoning.lmstudio',
        label: 'Reasoning - LM Studio Model',
        type: 'string',
        category: 'LLM Settings',
        description: 'Model path or identifier for LM Studio (reasoning)'
    },
    {
        key: 'models.reasoning.anthropic',
        label: 'Reasoning - Anthropic Model',
        type: 'string',
        category: 'LLM Settings',
        description: 'Model identifier for Anthropic (e.g. claude-2.1) (reasoning)'
    },
    {
        key: 'models.reasoning.bedrock',
        label: 'Reasoning - Bedrock Model',
        type: 'string',
        category: 'LLM Settings',
        description: 'Model identifier for AWS Bedrock (reasoning)'
    },
    {
        key: 'models.reasoning.openai',
        label: 'Reasoning - OpenAI Model',
        type: 'string',
        category: 'LLM Settings',
        description: 'Model identifier for OpenAI (e.g. gpt-4) (reasoning)'
    },
    {
        key: 'models.reasoning.openrouter',
        label: 'Reasoning - OpenRouter Model',
        type: 'string',
        category: 'LLM Settings',
        description: 'Model identifier for OpenRouter (reasoning)'
    },
    {
        key: 'models.reasoning.llama_cpp',
        label: 'Reasoning - Llama.cpp Model',
        type: 'string',
        category: 'LLM Settings',
        description: 'Model path for Llama.cpp (reasoning)'
    },

    // Document Processing Models
    {
        key: 'models.document.lmstudio',
        label: 'Document - LM Studio Model',
        type: 'string',
        category: 'LLM Settings',
        description: 'Model path or identifier for LM Studio (document processing)'
    },
    {
        key: 'models.document.anthropic',
        label: 'Document - Anthropic Model',
        type: 'string',
        category: 'LLM Settings',
        description: 'Model identifier for Anthropic (e.g. claude-2.1) (document processing)'
    },
    {
        key: 'models.document.bedrock',
        label: 'Document - Bedrock Model',
        type: 'string',
        category: 'LLM Settings',
        description: 'Model identifier for AWS Bedrock (document processing)'
    },
    {
        key: 'models.document.openai',
        label: 'Document - OpenAI Model',
        type: 'string',
        category: 'LLM Settings',
        description: 'Model identifier for OpenAI (e.g. gpt-4) (document processing)'
    },
    {
        key: 'models.document.openrouter',
        label: 'Document - OpenRouter Model',
        type: 'string',
        category: 'LLM Settings',
        description: 'Model identifier for OpenRouter (document processing)'
    },
    {
        key: 'models.document.llama_cpp',
        label: 'Document - Llama.cpp Model',
        type: 'string',
        category: 'LLM Settings',
        description: 'Model path for Llama.cpp (document processing)'
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

    // Search Settings
    {
        key: 'searchProvider',
        label: 'Search Provider',
        type: 'select',
        category: 'Search Settings',
        options: ['duckduckgo', 'searxng', 'google', 'brave'],
        defaultValue: 'duckduckgo'
    },
    {
        key: 'scrapingProvider',
        label: 'Scraping Provider',
        type: 'select',
        category: 'Search Settings',
        options: ['puppeteer', 'electron'],
        defaultValue: 'puppeteer',
        description: 'Browser engine to use for web scraping'
    },
    {
        key: 'duckduckgo.headless',
        label: 'DuckDuckGo Headless Mode',
        type: 'boolean',
        category: 'Search Settings',
        defaultValue: true,
        description: 'Run DuckDuckGo searches in headless browser mode'
    },
    {
        key: 'duckduckgo.timeout',
        label: 'DuckDuckGo Timeout (ms)',
        type: 'number',
        category: 'Search Settings',
        defaultValue: 30000,
        description: 'Timeout for DuckDuckGo search operations'
    },
    {
        key: 'brave.apiKey',
        label: 'Brave Search API Key',
        type: 'string',
        category: 'Search Settings',
        sensitive: true,
        description: 'API key for Brave Search'
    },
    {
        key: 'brave.endpoint',
        label: 'Brave Search Endpoint',
        type: 'string',
        category: 'Search Settings',
        defaultValue: 'https://api.search.brave.com/res/v1/web/search',
        description: 'API endpoint for Brave Search'
    },

    // Embeddings Providers
    {
        key: 'providers.embeddings',
        label: 'Embeddings Provider',
        type: 'select',
        category: 'Embeddings',
        options: ['openai', 'cohere', 'huggingface', 'local', 'llama_cpp'],
        defaultValue: 'local',
        required: true
    },
    // Embeddings Models
    {
        key: 'models.embeddings.openai',
        label: 'OpenAI Embeddings Model',
        type: 'string',
        category: 'Embeddings',
        description: 'Model identifier for OpenAI embeddings (e.g. text-embedding-3-small)',
        defaultValue: 'text-embedding-3-small'
    },
    {
        key: 'models.embeddings.cohere',
        label: 'Cohere Embeddings Model',
        type: 'string',
        category: 'Embeddings',
        description: 'Model identifier for Cohere embeddings',
        defaultValue: 'embed-english-v3.0'
    },
    {
        key: 'models.embeddings.huggingface',
        label: 'HuggingFace Embeddings Model',
        type: 'string',
        category: 'Embeddings',
        description: 'Model identifier for HuggingFace embeddings'
    },
    {
        key: 'models.embeddings.local',
        label: 'Local Embeddings Model',
        type: 'string',
        category: 'Embeddings',
        description: 'Model path for local embeddings'
    },
    {
        key: 'models.embeddings.llama_cpp',
        label: 'Llama.cpp Embeddings Model',
        type: 'string',
        category: 'Embeddings',
        description: 'Model path for Llama.cpp embeddings'
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
