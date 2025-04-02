// Custom type for chat handles that must start with @
export type ChatHandle = string & { readonly __chatHandleBrand: unique symbol };

// Type guard function to validate chat handles
export function isChatHandle(value: string): value is ChatHandle {
    return value?.startsWith('@') && value.length > 1;
}

// Utility function to create chat handles
export function createChatHandle(value: string): ChatHandle {
    if (!isChatHandle(value)) {
        throw new Error(`Invalid chat handle format: ${value}. Must start with @ and have at least one character`);
    }
    return value;
}
