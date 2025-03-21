import { ModelType } from "src/llm/types/ModelType";
import { ClientSettings } from './settingsDecorators';
import { LLMProvider } from "src/llm/types/LLMProvider";


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
}

export const modelConfigDefaults: Record<LLMProvider, ModelProviderConfig[]> = {
    openrouter: [{
        model: 'google/gemini-2.0-flash-001',
        provider: 'openrouter',
        type: ModelType.CONVERSATION
    }],
    lmstudio: [{
        model: 'MaziyarPanahi/Qwen2-1.5B-Instruct-GGUF/Qwen2-1.5B-Instruct.Q4_K_S.gguf',
        provider: 'lmstudio',
        type: ModelType.CONVERSATION
    }],
    anthropic: [{
        model: 'anthropic/claude-3-opus',
        provider: 'anthropic',
        type: ModelType.ADVANCED_REASONING
    },
    {
        model: 'claude-3-5-sonnet-20241022',
        provider: 'anthropic',
        type: ModelType.CONVERSATION
    }
    ]
}
//baseUrl: 'ws://localhost:1234'

export class ModelProviderConfig {
    @ClientSettings({
        label: 'Model Type',
        category: 'LLM Settings',
        type: 'select',
        options: ['conversation', 'reasoning', 'advancedReasoning', 'document', 'embeddings'],
        description: 'Type of model configuration'
    })
    type: ModelType = ModelType.CONVERSATION;

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
}
