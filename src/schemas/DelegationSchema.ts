import { getGeneratedSchema } from "src/helpers/schemaUtils";
import { SchemaType } from "./SchemaTypes";

export interface DelegationTask {
    description: string;
    assignee: string; // Agent handle
}

export interface DelegationResponse {
    projectName: string;
    projectGoal: string;
    tasks: DelegationTask[];
    responseMessage: string;
}

export const DelegationSchema = getGeneratedSchema(SchemaType.DelegationResponse);