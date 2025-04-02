import { LocalChatStorage, LocalTestClient } from 'src/chat/localChatClient';
import { Agent } from '../agents/agents';
import Logger from '../helpers/logger';
import { TaskManager } from 'src/tools/taskManager';
import { ArtifactManager } from 'src/tools/artifactManager';
import { LLMServices } from 'src/llm/ILLMService';
import { SettingsManager } from '../tools/settingsManager';
import { UUID } from 'src/types/uuid';
import { ArtifactType, DocumentSubtype } from 'src/tools/artifact';
import { MarkdownAgentConstructorParams, MarkdownConfigurableAgent } from 'src/agents/markdownConfigurableAgent';


export interface AgentLoaderParams {
    llmServices: LLMServices;
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
            // Look for agent configs in both the main artifacts and the assets/agents directory
            const artifactItems = await params.artifactManager.getArtifacts({
                type: ArtifactType.Document,
                'metadata.subtype': DocumentSubtype.AgentConfig
            });

            for (const artifact of artifactItems) {
                try {
                    const configParams: MarkdownAgentConstructorParams = {
                        ...params,
                        configArtifact: artifact,
                        chatClient: new LocalTestClient(artifact.id, "", params.chatStorage),
                        settings: params.settingsManager.getSettings(),
                        userId: artifact.id
                    };

                    const agent = new MarkdownConfigurableAgent(configParams);
                    await agent.initialize();
                    
                    agentsMap.set(agent.agentName, agent);
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
}
