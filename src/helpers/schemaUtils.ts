import { SchemaInliner } from './schemaInliner';
import { SchemaType } from '../schemas/SchemaTypes';
import schemas from '../schemas/schemasImport';
import { JSONSchema } from 'src/llm/ILLMService';
import { Config } from 'ts-json-schema-generator';
import { JSONSchema7 } from 'json-schema';

/**
 * Gets an inlined schema from a JSON schema file
 * @param schemaJson The imported JSON schema
 * @param type Optional specific type to extract from definitions
 * @returns The inlined schema
 */
export function getInlinedSchema(schemaJson: any, type?: string): JSONSchema {
    const inliner = new SchemaInliner(schemaJson);
    const inlined = inliner.inlineReferences(schemaJson.definitions);
    return type ? inlined[type] : inlined;
}

/**
 * Gets an inlined schema from our generated schema files
 * @param type The schema type to extract
 * @returns The inlined schema for the specified type
 */
export async function getGeneratedSchema(type: SchemaType): Promise<JSONSchema> {
    return getInlinedSchema(schemas, type);
}

//TODO: probably not that useful, but maybe for dynamic agents
export async function getDynamicSchema({ path, type  = "*"} : {path: string, type: string}) : Promise<JSONSchema7> {
    const tsj = await import("ts-json-schema-generator");

    const config : Config = {
        path,
        tsconfig: "TODO: need to copy this to dist",
        type
    };

    const outputPath = "path/to/output/file";
    return tsj.createGenerator(config).createSchema(config.type);    
}
