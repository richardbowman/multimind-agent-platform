import { LocalChatStorage, LocalTestClient } from 'src/chat/localChatClient';
import { Agent } from '../agents/agents';
import { AgentConstructorParams } from '../agents/interfaces/AgentConstructorParams';
import Logger from '../helpers/logger';
import { ChatClient } from 'src/chat/chatClient';
import { TaskManager } from 'src/tools/taskManager';
import { IVectorDatabase } from 'src/llm/IVectorDatabase';
import { ArtifactManager } from 'src/tools/artifactManager';
import { ILLMService } from 'src/llm/ILLMService';
import { SettingsManager } from '../tools/settingsManager';

interface AgentDefinition {
    className: string;
    sourcePath: string;
    userId: string;
    handle?: string;
    description?: string;
    enabled: boolean;
    config?: Record<string, any>;
}

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
            const settings = params.settingsManager.getSettings();
            const agentDefinitions = settings.agents;
            
            let channelIds : string[] = [];
            if (settings.defaultChannels) {
                Object.entries(settings.defaultChannels).forEach(([name, id]) => {
                    params.chatStorage.registerChannel(id, `#${name}`);
                    channelIds.push(id);
                    Logger.info(`Registered channel: ${name} (${id})`);
                });
            }
            
            for (const [agentName, definition] of Object.entries(agentDefinitions.agents)) {
                if (!definition.enabled) {
                    Logger.info(`Skipping disabled agent: ${agentName}`);
                    continue;
                }

                try {
                    // Dynamically import the agent class
                    const module = await import(definition.sourcePath);
                    const AgentClass : Agent<any,any> = module[definition.className];

                    if (!AgentClass) {
                        throw new Error(`Agent class ${definition.className} not found in module`);
                    }

                    // Create agent instance with merged params
                    const agent = new AgentClass({
                        ...params,
                        userId: definition.userId,
                        messagingHandle: definition.handle,
                        config: definition.config,
                        chatClient: new LocalTestClient(definition.userId, "", params.chatStorage)
                    } as AgentConstructorParams);
                    
                    for(const channelId of channelIds) {
                        agent.setupChatMonitor(channelId, definition.handle);
                    }

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
