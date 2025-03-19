import { LocalChatStorage, LocalTestClient } from 'src/chat/localChatClient';
import { Agent } from '../agents/agents';
import { AgentConstructorParams } from '../agents/interfaces/AgentConstructorParams';
import Logger from '../helpers/logger';
import { TaskManager } from 'src/tools/taskManager';
import { IVectorDatabase } from 'src/llm/IVectorDatabase';
import { ArtifactManager } from 'src/tools/artifactManager';
import { ILLMService } from 'src/llm/ILLMService';
import { SettingsManager } from '../tools/settingsManager';
import path from "path";
import { UUID } from 'src/types/uuid';
import { parseAsync } from '@babel/core';
import { ArtifactType, DocumentSubtype } from 'src/tools/artifact';
import { MarkdownConfigurableAgent } from 'src/agents/markdownConfigurableAgent';


export interface AgentLoaderParams {
    llmService: ILLMService;
    vectorDBService: IVectorDatabase;
    artifactManager: ArtifactManager
    taskManager: TaskManager;
    chatStorage: LocalChatStorage;
    settingsManager: SettingsManager;
    agents: Agents;
}

export interface Agents {
    agents: Record<UUID, Agent>;
}

type AgentType<T extends Agent> = new (...args: any[]) => T;

export class AgentLoader {
    static async loadMarkdownConfigurableAgents(params: AgentLoaderParams): Promise<Map<string, Agent>> {
        const agentsMap = new Map<string, Agent>();
        
        try {
            // Find all artifacts with AgentConfig subtype
            const artifacts = await params.artifactManager.searchArtifacts("", {
                type: ArtifactType.Document,
                subtype: DocumentSubtype.AgentConfig
            });

            for (const artifact of artifacts) {
                try {
                    const configParams: AgentConstructorParams = {
                        ...params,
                        config: {
                            configArtifactId: artifact.id
                        },
                        chatClient: new LocalTestClient(params.settingsManager.getSettings().defaultUserId, "", params.chatStorage),
                        settings: params.settingsManager.getSettings()
                    };

                    const agent = new MarkdownConfigurableAgent(configParams);
                    await agent.initialize();
                    
                    agentsMap.set(artifact.metadata?.agentName || `agent-${artifact.id}`, agent);
                    Logger.info(`Loaded markdown configurable agent from artifact ${artifact.id}`);
                } catch (error) {
                    Logger.error(`Failed to load agent from artifact ${artifact.id}:`, error);
                }
            }
        } catch (error) {
            Logger.error('Failed to load markdown configurable agents:', error);
        }

        return agentsMap;
    }

    static async loadAgents(params: AgentLoaderParams): Promise<Map<string, Agent>> {
        const agentsMap = new Map<string, Agent>();
        
        try {
            const _s = params.settingsManager.getSettings();
            const agentDefinitions = _s.agents;
            
            for (const [agentName, definition] of Object.entries(agentDefinitions)) {
                if (!definition.enabled) {
                    Logger.info(`Skipping disabled agent: ${agentName}`);
                    continue;
                }

                try {
                    // Use require.context to dynamically load agents
                    const agentContext = require.context('../agents', true, /\.ts$/);
                    const module = agentContext("./" + definition.sourcePath);
                    const AgentClass : AgentType<Agent> = module[definition.className] || module.default;

                    if (!AgentClass) {
                        throw new Error(`Agent class ${definition.className} not found in module`);
                    }

                    // Create agent instance with merged params
                    const constructorParams: AgentConstructorParams = {
                        ...params,
                        agentName: agentName,
                        userId: definition.userId,
                        messagingHandle: definition.handle,
                        description: definition.description,
                        config: definition.config,
                        chatClient: new LocalTestClient(definition.userId, "", params.chatStorage),
                        settings: _s,
                        agents: params.agents
                    };
                    const agent = new AgentClass(constructorParams);

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
