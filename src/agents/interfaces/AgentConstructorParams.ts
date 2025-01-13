import { ArtifactManager } from "src/tools/artifactManager";
import { ChatClient } from "../../chat/chatClient";
import { ILLMService } from "../../llm/ILLMService";
import { TaskManager } from "../../tools/taskManager";
import { IVectorDatabase } from "src/llm/IVectorDatabase";
import { Settings } from "src/tools/settingsManager";

export interface AgentConstructorParams {
    agentName?: string;
    chatClient: ChatClient;
    llmService: ILLMService;
    vectorDBService: IVectorDatabase;
    artifactManager?: ArtifactManager
    taskManager: TaskManager;
    userId: string;
    messagingHandle?: string;
    settings: Settings
}
