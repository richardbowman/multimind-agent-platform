import { SchemaInliner } from './schemaInliner';

/**
 * Gets an inlined schema from a JSON schema file
 * @param schemaJson The imported JSON schema
 * @param type Optional specific type to extract from definitions
 * @returns The inlined schema
 */
export function getInlinedSchema(schemaJson: any, type?: string): any {
    const inliner = new SchemaInliner(schemaJson);
    const inlined = inliner.inlineReferences(schemaJson.definitions);
    return type ? inlined[type] : inlined;
}

/**
 * Gets an inlined schema from our generated schema files
 * @param type The interface type to extract from the schema
 * @returns The inlined schema for the specified type
 */
export function getGeneratedSchema<T>(type: new () => T): any {
    const typeName = type.name;
    const schemaJson = require(`../schemas/generated/${typeName}.json`);
    return getInlinedSchema(schemaJson, typeName);
}
