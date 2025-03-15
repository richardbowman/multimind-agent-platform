import { getGeneratedSchema } from '../llm/modelHelpers';

export interface DelegationTask {
    description: string;
    assignee: string; // Agent handle
}

export interface DelegationSchema {
    projectName: string;
    projectGoal: string;
    tasks: DelegationTask[];
    responseMessage: string;
}

export const delegationSchema = getGeneratedSchema<DelegationSchema>({
    type: 'object',
    properties: {
        projectName: { type: 'string' },
        projectGoal: { type: 'string' },
        tasks: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    description: { type: 'string' },
                    assignee: { type: 'string' }
                }
            }
        },
        responseMessage: { type: 'string' }
    }
});
