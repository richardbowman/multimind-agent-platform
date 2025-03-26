import { ArtifactManager } from "src/tools/artifactManager";
import { ChatClient } from "../../chat/chatClient";
import { ILLMService, LLMServices } from "../../llm/ILLMService";
import { TaskManager } from "../../tools/taskManager";
import { IVectorDatabase } from "src/llm/IVectorDatabase";
import { UUID } from "src/types/uuid";
import { Agents } from "src/utils/AgentLoader";
import { Settings } from "src/tools/settings";
import { AgentConfig } from 'src/tools/AgentConfig';

export interface AgentConstructorParams {
    agentName?: string;
    description?: string;
    chatClient: ChatClient;
    /**@deprecated */
    llmService: ILLMService;
    llmServices: LLMServices;
    vectorDBService: IVectorDatabase;
    artifactManager: ArtifactManager;
    taskManager: TaskManager;
    userId: UUID;
    config?: AgentConfig;
    messagingHandle?: string;
    settings: Settings;
    agents: Agents
}
