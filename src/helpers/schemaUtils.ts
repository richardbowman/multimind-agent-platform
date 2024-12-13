import { SchemaInliner } from './schemaInliner';
import { SchemaType } from '../schemas/SchemaTypes';

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
 * @param type The schema type to extract
 * @returns The inlined schema for the specified type
 */
export function getGeneratedSchema(type: SchemaType): any {
    const schemaJson = require(`../schemas/schemas.json`);
    return getInlinedSchema(schemaJson, type);
}
