// Regular expression patterns
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Custom types
export type UUID = string & { readonly __uuidBrand: unique symbol };

// Type guard functions
export function isUUID(value: string): value is UUID {
    return UUID_PATTERN.test(value);
}

// Utility functions
export function createUUID(value?: string): UUID {
    if (!value) {
        return global.crypto.randomUUID() as UUID;
    }
    if (!isUUID(value)) {
        throw new Error(`Invalid UUID format: ${value}`);
    }
    return value;
}

// Utility functions
export function asUUID(value: string): UUID {
    if (!isUUID(value)) {
        throw new Error(`Invalid UUID format: ${value}`);
    }
    return value;
}
