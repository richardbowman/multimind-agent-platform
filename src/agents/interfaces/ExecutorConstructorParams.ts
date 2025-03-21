import { ILLMService } from 'src/llm/ILLMService';
import { IVectorDatabase } from 'src/llm/IVectorDatabase';
import { ModelHelpers } from 'src/llm/modelHelpers';
import { ArtifactManager } from 'src/tools/artifactManager';
import { Settings } from 'src/tools/settings';
import { TaskManager } from 'src/tools/taskManager';
import { ChatClient } from 'src/chat/chatClient';
import { UUID } from 'src/types/uuid';
import { ModelType } from "src/llm/types/ModelType";


export interface ExecutorConstructorParams {
    vectorDB: IVectorDatabase;
    /** @deprecated */
    llmService: ILLMService;
    llmServices: Record<ModelType, ILLMService>;
    taskManager: TaskManager;
    artifactManager: ArtifactManager;
    settings: Settings;
    userId: UUID;
    agentName?: string; // only provided by Configurable Agents
    config?: Record<string, any>;
    modelHelpers: ModelHelpers;
    chatClient: ChatClient;
}
