import { Agent } from '../agents/agents';
import { AgentConstructorParams } from '../agents/interfaces/AgentConstructorParams';
import { readdirSync } from 'fs';
import { join } from 'path';
import Logger from '../helpers/logger';

export class AgentLoader {
    static async loadAgents(params: AgentConstructorParams): Promise<Map<string, Agent<any, any>>> {
        const agentsMap = new Map<string, Agent<any, any>>();
        const agentsDir = join(process.cwd(), 'src', 'agents');
        
        try {
            const files = readdirSync(agentsDir)
                .filter(file => 
                    file.endsWith('.ts') && 
                    !file.includes('test') &&
                    !file.includes('interface') &&
                    !file.includes('agents.ts'));

            for (const file of files) {
                try {
                    const module = await import(join(agentsDir, file));
                    const agentClass = Object.values(module)[0];
                    
                    if (typeof agentClass === 'function') {
                        const agent = new agentClass(params);
                        const agentName = file.replace('.ts', '');
                        agentsMap.set(agentName, agent);
                        Logger.info(`Loaded agent: ${agentName}`);
                    }
                } catch (error) {
                    Logger.error(`Failed to load agent from ${file}:`, error);
                }
            }
        } catch (error) {
            Logger.error('Failed to read agents directory:', error);
        }

        return agentsMap;
    }
}
