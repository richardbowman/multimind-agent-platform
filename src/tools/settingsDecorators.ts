import 'reflect-metadata';

export function ClientSettings(metadata: {
    label: string;
    category: string;
    description?: string;
    type?: 'string' | 'number' | 'boolean' | 'select' | 'section';
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

export function getClientSettingsMetadata(target: any, prefix: string = '', parentLabel: string = ''): Record<string, any> {
    const metadata: Record<string, any> = {};
    
    // Handle null/undefined
    if (!target) {
        console.log('Skipping null/undefined target');
        return metadata;
    }
    
    // Get properties from the entire prototype chain
    const properties : Set<string> = new Set();
    let currentTarget = target;
    
    while (currentTarget && currentTarget !== Object.prototype) {
        // Get own properties including non-enumerable ones
        Object.getOwnPropertyNames(currentTarget).forEach(prop => properties.add(prop));
        
        // Get properties from prototype
        const proto = Object.getPrototypeOf(currentTarget);
        if (proto && proto !== Object.prototype) {
            Object.getOwnPropertyNames(proto).forEach(prop => properties.add(prop));
        }
        currentTarget = proto;
    }
    
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
            const combinedMeta = { ...meta };
            if (parentLabel) {
                combinedMeta.label = `${parentLabel}: ${meta.label}`;
            }
            metadata[propertyPath] = combinedMeta;
        }
        
        // Recursively get metadata for object properties
        try {
            const value = target[property];
            if (value && typeof value === 'object' && !Array.isArray(value)) {
                const currentLabel = meta?.label || '';
                const newParentLabel = parentLabel ? `${parentLabel}: ${currentLabel}` : currentLabel;
                const nestedMetadata = getClientSettingsMetadata(value, propertyPath, newParentLabel);
                Object.assign(metadata, nestedMetadata);
            }
        } catch (e) {
            console.log(`Error accessing ${propertyPath}:`, e);
            // Skip properties that can't be accessed
            continue;
        }
    }
    
    return metadata;
}
