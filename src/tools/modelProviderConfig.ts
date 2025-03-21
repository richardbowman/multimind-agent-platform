import { ModelType } from "src/llm/types/ModelType";
import { ClientSettings } from './settingsDecorators';
import { LLMProvider } from "src/llm/types/LLMProvider";

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
        options: Object.values(LLMProvider)
    })
    provider: LLMProvider = LLMProvider.LMSTUDIO;

    @ClientSettings({
        label: 'Model',
        category: 'LLM Settings',
        type: 'select',
        description: 'Model identifier for the selected provider',
        selector: {
            component: 'ModelSelector',
            providerField: 'provider'
        }
    })
    model: string = '';
}

export const MODEL_CONFIG_DEFAULTS : Record<LLMProvider, ModelProviderConfig> = {
    [LLMProvider.OPENROUTER]: {                                                                                                                
        type: ModelType.CONVERSATION,
        provider: LLMProvider.OPENROUTER,                                                                                                          
        model: 'openai/gpt-3.5-turbo'                                                                                                          
    },                                                                                                                                         
    [LLMProvider.OPENAI]: {                                                                                                                    
        type: ModelType.CONVERSATION,
        provider: LLMProvider.OPENAI,                                                                                                              
        model: 'gpt-3.5-turbo'                                                                                                                 
    },                                                                                                                                         
    [LLMProvider.ANTHROPIC]: {                                                                                                                 
        type: ModelType.CONVERSATION,
        provider: LLMProvider.ANTHROPIC,
        model: 'claude-3-haiku-20240307'                                                                                                       
    },                                                                                                                                         
    [LLMProvider.DEEPSEEK]: {                                                                                                                  
        type: ModelType.CONVERSATION,
        provider: LLMProvider.DEEPSEEK,                                                                                                            
        model: 'deepseek-chat'                                                                                                                 
    }
}

export const MODEL_CONFIG_DEFAULT = [
    MODEL_CONFIG_DEFAULTS[LLMProvider.OPENAI]
]
