import { ArtifactManager } from "src/tools/artifactManager";
import { ChatClient } from "../../chat/chatClient";
import { ILLMService } from "../../llm/ILLMService";
import { TaskManager } from "../../tools/taskManager";
import { IVectorDatabase } from "src/llm/IVectorDatabase";
import { Settings } from "src/tools/settingsManager";
import { UUID } from "src/types/uuid";
import { Agents } from "src/utils/AgentLoader";

export interface AgentConstructorParams {
    agentName?: string;
    chatClient: ChatClient;
    llmService: ILLMService;
    vectorDBService: IVectorDatabase;
    artifactManager?: ArtifactManager
    taskManager: TaskManager;
    userId: UUID;
    messagingHandle?: string;
    settings: Settings
    agents: Agents
}
