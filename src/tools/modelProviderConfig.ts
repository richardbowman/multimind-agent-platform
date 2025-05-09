import { ModelType } from "src/llm/types/ModelType";
import { ClientSettings } from './settingsDecorators';
import { LLMProvider } from "src/llm/types/LLMProvider";

export class ModelProviderConfig {
    @ClientSettings({
        label: 'Enabled',
        category: 'LLM Settings',
        type: 'boolean',
        showInList: true
    })
    enabled: boolean = true;

    @ClientSettings({
        label: 'Model Type',
        category: 'LLM Settings',
        type: 'select',
        options: Object.values(ModelType),
        description: 'Type of model configuration',
        matchDefaults: true,
        showInList: true
    })
    type: ModelType = ModelType.CONVERSATION;

    @ClientSettings({
        label: 'Provider',
        category: 'LLM Settings',
        type: 'select',
        options: Object.values(LLMProvider),
        matchDefaults: true,
        showInList: true
    })
    provider: LLMProvider = LLMProvider.LMSTUDIO;

    @ClientSettings({
        label: 'Model',
        category: 'LLM Settings',
        type: 'select',
        description: 'Model identifier for the selected provider',
        selector: {
            component: 'ModelSelector',
            providerField: 'provider',
            modelTypeField: 'type'
        },
        showInList: true
    })
    model: string = '';

    @ClientSettings({
        label: 'Context Size',
        category: 'LLM Settings',
        type: 'number'
    })
    contextSize: number = 16384;
}

export const MODEL_CONFIG_DEFAULTS = [
    {
        type: ModelType.CONVERSATION,
        provider: LLMProvider.OPENROUTER,
        model: 'google/gemini-2.0-flash-001',
        enabled: true
    },
    {
        type: ModelType.CODING,
        provider: LLMProvider.OPENROUTER,
        model: 'anthropic/claude-3.7-sonnet',
        enabled: true
    },
    {
        type: ModelType.CONVERSATION,
        provider: LLMProvider.OPENAI,
        model: 'gpt-3.5-turbo',
        enabled: true
    },
    {
        type: ModelType.CONVERSATION,
        provider: LLMProvider.ANTHROPIC,
        model: 'claude-3-5-haiku-20241022',
        enabled: true
    },
    {
        type: ModelType.REASONING,
        provider: LLMProvider.ANTHROPIC,
        model: 'claude-3-7-sonnet-20250219',
        enabled: true
    },
    {
        type: ModelType.CONVERSATION,
        provider: LLMProvider.DEEPSEEK,
        model: 'deepseek-chat',
        enabled: true
    },
    {
        type: ModelType.EMBEDDINGS,
        provider: LLMProvider.LLAMA_CPP,
        model: 'nomic-ai/nomic-embed-text-v1.5-GGUF/nomic-embed-text-v1.5.Q4_K_M.gguf',
        enabled: true
    },
    {
        type: ModelType.EMBEDDINGS,
        provider: LLMProvider.OPENAI,
        model: 'text-embedding-3-small',
        enabled: true
    },
    {
        type: ModelType.EMBEDDINGS,
        provider: LLMProvider.LMSTUDIO,
        model: 'text-embedding-nomic-embed-text-v1.5',
        enabled: true
    }
];

export const MODEL_CONFIG_DEFAULT = [
    MODEL_CONFIG_DEFAULTS.find(m => m.provider === LLMProvider.OPENROUTER && m.type === ModelType.CONVERSATION)!,
    MODEL_CONFIG_DEFAULTS.find(m => m.provider === LLMProvider.OPENROUTER && m.type === ModelType.CODING)!,
    MODEL_CONFIG_DEFAULTS.find(m => m.provider === LLMProvider.LLAMA_CPP && m.type === ModelType.EMBEDDINGS)!
]
