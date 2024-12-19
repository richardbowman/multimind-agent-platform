import { Agent } from '../agents/agents';
import { AgentConstructorParams } from '../agents/interfaces/AgentConstructorParams';
import Logger from '../helpers/logger';
import { agentDefinitions } from '../agents/agentDefinitions';

export class AgentLoader {
    static async loadAgents(params: AgentConstructorParams): Promise<Map<string, Agent<any, any>>> {
        const agentsMap = new Map<string, Agent<any, any>>();
        
        try {
            for (const [agentName, definition] of Object.entries(agentDefinitions)) {
                try {
                    const agent = new definition.className({
                        ...params,
                        userId: definition.userId,
                        messagingHandle: definition.handle
                    });
                    
                    agentsMap.set(agentName, agent);
                    Logger.info(`Loaded agent: ${agentName} with handle ${definition.handle}`);
                } catch (error) {
                    Logger.error(`Failed to load agent ${agentName}:`, error);
                }
            }
        } catch (error) {
            Logger.error('Failed to load agents:', error);
        }

        return agentsMap;
    }
}
