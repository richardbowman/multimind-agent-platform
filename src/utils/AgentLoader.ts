import { Agent } from '../agents/agents';
import { AgentConstructorParams } from '../agents/interfaces/AgentConstructorParams';
import Logger from '../helpers/logger';
import * as fs from 'fs';
import * as path from 'path';

interface AgentDefinition {
    className: string;
    sourcePath: string;
    userId: string;
    handle?: string;
    description?: string;
    enabled: boolean;
    config?: Record<string, any>;
}

export class AgentLoader {
    static async loadAgents(params: AgentConstructorParams): Promise<Map<string, Agent<any, any>>> {
        const agentsMap = new Map<string, Agent<any, any>>();
        
        try {
            // Load agent definitions from JSON config
            const configPath = path.join(process.cwd(), 'src', 'config', 'agents.json');
            const agentDefinitions = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as Record<string, AgentDefinition>;
            
            for (const [agentName, definition] of Object.entries(agentDefinitions)) {
                if (!definition.enabled) {
                    Logger.info(`Skipping disabled agent: ${agentName}`);
                    continue;
                }

                try {
                    // Dynamically import the agent class
                    const module = await import(definition.sourcePath);
                    const AgentClass = module[definition.className];

                    if (!AgentClass) {
                        throw new Error(`Agent class ${definition.className} not found in module`);
                    }

                    // Create agent instance with merged params
                    const agent = new AgentClass({
                        ...params,
                        userId: definition.userId,
                        messagingHandle: definition.handle,
                        config: definition.config
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
