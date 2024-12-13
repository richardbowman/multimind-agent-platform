import { ChatClient } from "../../chat/chatClient";
import { ILLMService } from "../../llm/ILLMService";
import { IVectorDBService } from "../../llm/IVectorDBService";
import { TaskManager } from "../../tools/taskManager";

export interface AgentConstructorParams {
    chatClient: ChatClient;
    llmService: ILLMService;
    vectorDBService: IVectorDBService;
    taskManager: TaskManager;
    userId: string;
    messagingHandle?: string;
}
