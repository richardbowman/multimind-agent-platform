import { LocalChatStorage, LocalTestClient } from 'src/chat/localChatClient';
import { Agent } from '../agents/agents';
import { AgentConstructorParams } from '../agents/interfaces/AgentConstructorParams';
import Logger from '../helpers/logger';
import { TaskManager } from 'src/tools/taskManager';
import { IVectorDatabase } from 'src/llm/IVectorDatabase';
import { ArtifactManager } from 'src/tools/artifactManager';
import { ILLMService } from 'src/llm/ILLMService';
import { SettingsManager } from '../tools/settingsManager';



export interface AgentLoaderParams {
    llmService: ILLMService;
    vectorDBService: IVectorDatabase;
    artifactManager: ArtifactManager
    taskManager: TaskManager;
    chatStorage: LocalChatStorage;
    defaultChannelId: string;
    settingsManager: SettingsManager;
}

export class AgentLoader {
    static async loadAgents(params: AgentLoaderParams): Promise<Map<string, Agent<any, any>>> {
        const agentsMap = new Map<string, Agent<any, any>>();
        
        try {
            const _s = params.settingsManager.getSettings();
            const agentDefinitions = _s.agents;
            
            for (const [agentName, definition] of Object.entries(agentDefinitions)) {
                if (!definition.enabled) {
                    Logger.info(`Skipping disabled agent: ${agentName}`);
                    continue;
                }

                try {
                    // Dynamically import the agent class
                    const module = await import(definition.sourcePath);
                    const AgentClass : Agent = module[definition.className];

                    if (!AgentClass) {
                        throw new Error(`Agent class ${definition.className} not found in module`);
                    }

                    // Create agent instance with merged params
                    const agent = new AgentClass({
                        ...params,
                        agentName: agentName,
                        userId: definition.userId,
                        messagingHandle: definition.handle,
                        config: definition.config,
                        chatClient: new LocalTestClient(definition.userId, "", params.chatStorage),
                        settings: _s
                    } as AgentConstructorParams);

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
