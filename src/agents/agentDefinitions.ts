import { RouterAgent } from './RouterAgent';

export interface AgentDefinition {
    className: any; // Reference to the agent class
    userId: string;
    handle?: string;
    description?: string;
}

export const agentDefinitions: Record<string, AgentDefinition> = {
    'RouterAgent': {
        className: RouterAgent,
        userId: 'router-agent',
        handle: '@router',
        description: 'Routes requests to appropriate specialized agents'
    }
    // Add other agents here as needed
};
