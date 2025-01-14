import 'reflect-metadata';

export function ClientSettings(metadata: {
    label: string;
    category: string;
    description?: string;
    type?: 'string' | 'number' | 'boolean' | 'select';
    options?: string[];
    defaultValue?: any;
    min?: number;
    max?: number;
    step?: number;
    sensitive?: boolean;
    required?: boolean;
}) {
    return function (target: any, propertyKey: string) {
        Reflect.defineMetadata('clientSettings', metadata, target, propertyKey);
    };
}

export function getClientSettingsMetadata(target: any, prefix: string = ''): Record<string, any> {
    const metadata: Record<string, any> = {};
    
    // Handle null/undefined
    if (!target) {
        return metadata;
    }

    // Get both own properties and prototype properties
    const properties = new Set([
        ...Object.getOwnPropertyNames(target),
        ...Object.getOwnPropertyNames(Object.getPrototypeOf(target))
    ]);
    
    for (const property of properties) {
        // Skip constructor and private/special properties
        if (property === 'constructor' || property.startsWith('_')) {
            continue;
        }

        const propertyPath = prefix ? `${prefix}.${property}` : property;
        
        // Get metadata from both instance and prototype
        const meta = Reflect.getMetadata('clientSettings', target, property) || 
                    Reflect.getMetadata('clientSettings', Object.getPrototypeOf(target), property);
        
        if (meta) {
            metadata[propertyPath] = meta;
        }
        
        // Recursively get metadata for object properties
        try {
            const value = target[property];
            if (value && typeof value === 'object' && !Array.isArray(value)) {
                const nestedMetadata = getClientSettingsMetadata(value, propertyPath);
                Object.assign(metadata, nestedMetadata);
            }
        } catch (e) {
            // Skip properties that can't be accessed
            continue;
        }
    }
    
    return metadata;
}
