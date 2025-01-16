import { ArtifactManager } from "../tools/artifactManager";
import { LLMCallLogger } from "../llm/LLMLogger";
import { ChatClient } from "src/chat/chatClient";
import { TaskManager } from "src/tools/taskManager";
import { LogReader } from "src/server/LogReader";
import { SettingsManager } from "../tools/settingsManager";

import { MainWindow } from "../windows/MainWindow";
import { ILLMService } from "src/llm/ILLMService";
import { IVectorDatabase } from "src/llm/IVectorDatabase";

export interface BackendServicesWithWindows extends BackendServices {
    mainWindow: MainWindow;
}

export interface BackendServicesConfigNeeded extends Partial<BackendServices> {
    mainWindow: MainWindow;
}

export interface BackendServices extends BackendServicesOnly {
    cleanup(): Promise<void>;

    chatClient: ChatClient;
    taskManager: TaskManager;
    artifactManager: ArtifactManager;
    llmLogger: LLMCallLogger;
    logReader: LogReader;
    llmService: ILLMService;
    vectorDB: IVectorDatabase;

    mainWindow: MainWindow;
}

export interface BackendServicesOnly {
    settingsManager: SettingsManager;
}
