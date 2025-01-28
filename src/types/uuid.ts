import crypto from 'crypto';

// Regular expression patterns
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CHANNEL_HANDLE_PATTERN = /^#[a-zA-Z0-9_-]+$/;

// Custom types
export type UUID = string & { readonly __uuidBrand: unique symbol };
export type ChannelHandle = string & { readonly __channelHandleBrand: unique symbol };

// Type guard functions
export function isUUID(value: string): value is UUID {
    return UUID_PATTERN.test(value);
}

export function isChannelHandle(value: string): value is ChannelHandle {
    return CHANNEL_HANDLE_PATTERN.test(value);
}

// Utility functions
export function createUUID(value?: string): UUID {
    if (!value) {
        return crypto.randomUUID() as UUID;
    }
    if (!isUUID(value)) {
        throw new Error(`Invalid UUID format: ${value}`);
    }
    return value as UUID;
}

export function createChannelHandle(value: string): ChannelHandle {
    if (!value.startsWith('#')) {
        value = '#' + value;
    }
    if (!isChannelHandle(value)) {
        throw new Error(`Invalid channel handle format: ${value}`);
    }
    return value as ChannelHandle;
}
