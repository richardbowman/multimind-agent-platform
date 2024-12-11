import { readFileSync } from 'fs';
import path from 'path';

export class SchemaInliner {
    private definitions: Record<string, any>;
    private processedRefs: Set<string> = new Set();

    constructor(schemaContent: any) {
        this.definitions = schemaContent.definitions || {};
    }

    public inlineReferences(schema: any): any {
        this.processedRefs.clear(); // Reset processed refs for new inlining operation
        return this.inlineRefsRecursive(schema);
    }

    private inlineRefsRecursive(obj: any): any {
        if (!obj || typeof obj !== 'object') {
            return obj;
        }

        if (Array.isArray(obj)) {
            return obj.map(item => this.inlineRefsRecursive(item));
        }

        const result: any = {};

        for (const [key, value] of Object.entries(obj)) {
            if (key === '$ref') {
                const refPath = (value as string).split('/').pop()!;
                
                // Prevent circular references
                if (this.processedRefs.has(refPath)) {
                    throw new Error(`Circular reference detected: ${refPath}`);
                }
                
                this.processedRefs.add(refPath);
                
                if (!this.definitions[refPath]) {
                    throw new Error(`Reference not found: ${refPath}`);
                }

                // Merge the referenced definition
                const inlinedRef = this.inlineRefsRecursive(this.definitions[refPath]);
                Object.assign(result, inlinedRef);
            } else {
                result[key] = this.inlineRefsRecursive(value);
            }
        }

        return result;
    }

    public static inlineSchemaFile(schemaPath: string): Record<string, any> {
        const schemaContent = JSON.parse(readFileSync(schemaPath, 'utf-8'));
        const inliner = new SchemaInliner(schemaContent);
        
        const inlinedDefinitions: Record<string, any> = {};
        
        // Inline each definition
        for (const [key, value] of Object.entries(schemaContent.definitions)) {
            inlinedDefinitions[key] = inliner.inlineReferences(value);
        }
        
        return {
            $schema: schemaContent.$schema,
            definitions: inlinedDefinitions
        };
    }
}
