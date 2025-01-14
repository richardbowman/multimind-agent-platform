import { ILLMService } from 'src/llm/ILLMService';
import { IVectorDatabase } from 'src/llm/IVectorDatabase';
import { ArtifactManager } from 'src/tools/artifactManager';
import { Settings } from 'src/tools/settingsManager';
import { TaskManager } from 'src/tools/taskManager';


export interface ExecutorConstructorParams {
    vectorDB: IVectorDatabase;
    llmService: ILLMService;
    taskManager: TaskManager;
    artifactManager: ArtifactManager;
    settings: Settings;
    userId?: string;
    config?: Record<string, any>;
}
