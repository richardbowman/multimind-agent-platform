import { ArtifactManager } from "src/tools/artifactManager";
import { ChatClient } from "../../chat/chatClient";
import { ILLMService } from "../../llm/ILLMService";
import { TaskManager } from "../../tools/taskManager";
import { IVectorDatabase } from "src/llm/IVectorDatabase";

export interface AgentConstructorParams {
    chatClient: ChatClient;
    llmService: ILLMService;
    vectorDBService: IVectorDatabase;
    artifactManager?: ArtifactManager
    taskManager: TaskManager;
    userId: string;
    messagingHandle?: string;
}
