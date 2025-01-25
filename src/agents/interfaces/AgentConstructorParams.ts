import { ArtifactManager } from "src/tools/artifactManager";
import { ChatClient } from "../../chat/chatClient";
import { ILLMService } from "../../llm/ILLMService";
import { TaskManager } from "../../tools/taskManager";
import { IVectorDatabase } from "src/llm/IVectorDatabase";
import { UUID } from "src/types/uuid";
import { Agents } from "src/utils/AgentLoader";
import { AgentConfig, Settings } from "src/tools/settings";

export interface AgentConstructorParams {
    agentName?: string;
    description?: string;
    chatClient: ChatClient;
    llmService: ILLMService;
    vectorDBService: IVectorDatabase;
    artifactManager?: ArtifactManager
    taskManager: TaskManager;
    userId: UUID;
    config?: AgentConfig;
    messagingHandle?: string;
    settings: Settings;
    agents: Agents
}
