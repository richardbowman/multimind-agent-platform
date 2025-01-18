import crypto from 'crypto';

// Regular expression pattern for UUID v4
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Custom type for UUID strings
export type UUID = string & { readonly __uuidBrand: unique symbol };

// Type guard function to validate UUIDs
export function isUUID(value: string): value is UUID {
    return UUID_PATTERN.test(value);
}

// Utility function to create UUIDs
export function createUUID(value?: string): UUID {
    if (!value) {
        return crypto.randomUUID() as UUID;
    }
    if (!isUUID(value)) {
        throw new Error(`Invalid UUID format: ${value}`);
    }
    return value as UUID;
}
