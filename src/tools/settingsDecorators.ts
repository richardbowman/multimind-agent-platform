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

export function getClientSettingsMetadata(target: any): Record<string, any> {
    const properties = Object.getOwnPropertyNames(target);
    const metadata: Record<string, any> = {};
    
    for (const property of properties) {
        const meta = Reflect.getMetadata('clientSettings', target, property);
        if (meta) {
            metadata[property] = meta;
        }
    }
    
    return metadata;
}
