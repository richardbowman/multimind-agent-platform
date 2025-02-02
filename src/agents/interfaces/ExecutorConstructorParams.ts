import { ILLMService } from 'src/llm/ILLMService';
import { IVectorDatabase } from 'src/llm/IVectorDatabase';
import { ModelHelpers } from 'src/llm/modelHelpers';
import { ArtifactManager } from 'src/tools/artifactManager';
import { Settings } from 'src/tools/settings';
import { TaskManager } from 'src/tools/taskManager';
import { ChatClient } from 'src/chat/chatClient';
import { UUID } from 'src/types/uuid';


export interface ExecutorConstructorParams {
    vectorDB: IVectorDatabase;
    llmService: ILLMService;
    taskManager: TaskManager;
    artifactManager: ArtifactManager;
    settings: Settings;
    userId: UUID;
    config?: Record<string, any>;
    modelHelpers: ModelHelpers;
    chatClient: ChatClient;
}
