import { LocalChatStorage, LocalTestClient } from 'src/chat/localChatClient';
import { Agent } from '../agents/agents';
import { AgentConstructorParams } from '../agents/interfaces/AgentConstructorParams';
import Logger from '../helpers/logger';
import * as fs from 'fs';
import * as path from 'path';
import { ONBOARDING_CHANNEL_ID } from 'src/helpers/config';
import { ChatClient } from 'src/chat/chatClient';
import { TaskManager } from 'src/tools/taskManager';
import { IVectorDatabase } from 'src/llm/IVectorDatabase';
import { ArtifactManager } from 'src/tools/artifactManager';
import { ILLMService } from 'src/llm/ILLMService';

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
}

export class AgentLoader {
    static async loadAgents(params: AgentLoaderParams): Promise<Map<string, Agent<any, any>>> {
        const agentsMap = new Map<string, Agent<any, any>>();
        
        try {
            // Load agent definitions from JSON config
            const configPath = path.join(process.cwd(), 'src', 'config', 'agents.json');
            const agentDefinitions = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as Record<string, AgentDefinition>;

            let channelIds : string[] = [];
            if (agentDefinitions.defaultChannels) {
                Object.entries(agentDefinitions.defaultChannels).forEach(([name, id]) => {
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
