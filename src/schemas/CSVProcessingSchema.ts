import { JSONSchema } from "../llm/ILLMService";
import { getGeneratedSchema } from "../llm/modelHelpers";
import { UUID } from "../types/uuid";

export interface CSVProcessingSchema {
    projectName: string;
    taskDescription: string;
    assignedAgent: string;
}

export const CSVProcessingSchema: JSONSchema = getGeneratedSchema<CSVProcessingSchema>({
    type: "object",
    properties: {
        projectName: { type: "string" },
        taskDescription: { type: "string" },
        assignedAgent: { type: "string" }
    },
    required: ["projectName", "taskDescription", "assignedAgent"]
});

export interface CSVResultSchema {
    columns: Array<{
        name: string;
        value: string;
    }>;
}

export const CSVResultSchema: JSONSchema = getGeneratedSchema<CSVResultSchema>({
    type: "object",
    properties: {
        columns: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    name: { type: "string" },
                    value: { type: "string" }
                },
                required: ["name", "value"]
            }
        }
    },
    required: ["columns"]
});
