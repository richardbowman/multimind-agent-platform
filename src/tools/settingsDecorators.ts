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
    
    // Get own properties
    const properties = Object.getOwnPropertyNames(target);
    
    for (const property of properties) {
        const propertyPath = prefix ? `${prefix}.${property}` : property;
        
        // Get metadata for current property
        const meta = Reflect.getMetadata('clientSettings', target, property);
        if (meta) {
            metadata[propertyPath] = meta;
        }
        
        // Recursively get metadata for object properties
        const value = target[property];
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            const nestedMetadata = getClientSettingsMetadata(value, propertyPath);
            Object.assign(metadata, nestedMetadata);
        }
    }
    
    return metadata;
}
