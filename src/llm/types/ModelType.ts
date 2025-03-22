

export enum ModelType {
    CONVERSATION = "conversation",
    REASONING = "reasoning",
    ADVANCED_REASONING = "advancedReasoning",
    CODING = "coding",
    DOCUMENT = "document",
    EMBEDDINGS = 'embeddings'
}

export const ModelTypeFallbackStrategy : Record<ModelType, ModelType|null> = {
    [ModelType.CODING]: ModelType.ADVANCED_REASONING,
    [ModelType.ADVANCED_REASONING]: ModelType.REASONING,
    [ModelType.DOCUMENT]: ModelType.CONVERSATION,
    [ModelType.CONVERSATION]: null,
    [ModelType.REASONING]: ModelType.CONVERSATION,
    [ModelType.EMBEDDINGS]: null
}