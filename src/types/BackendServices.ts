import { ArtifactManager } from "../tools/artifactManager";
import { LLMCallLogger } from "../llm/LLMLogger";
import { ChatClient } from "src/chat/chatClient";
import { TaskManager } from "src/tools/taskManager";
import { LogReader } from "src/server/LogReader";
import { SettingsManager } from "../tools/settingsManager";

import { MainWindow } from "../windows/MainWindow";
import { ILLMService } from "src/llm/ILLMService";
import { IVectorDatabase } from "src/llm/IVectorDatabase";
import { ConfigurationError } from "src/errors/ConfigurationError";

export interface BackendServicesWithWindows extends BackendServices {
    type: "full",
    mainWindow: MainWindow;
}

export interface BackendServicesConfigNeeded extends BackendServicesOnly {
    type: "configNeeded",
    mainWindow: MainWindow;
    error: ConfigurationError
}

export interface BackendServices extends BackendServicesOnly {
    cleanup(): Promise<void>;
    chatClient: ChatClient;
    taskManager: TaskManager;
    artifactManager: ArtifactManager;
    llmService: ILLMService;
    vectorDB: IVectorDatabase;
    llmLogger: LLMCallLogger;
    agentInfo: any;
}

export interface BackendServicesOnly {
    settingsManager: SettingsManager;
    logReader: LogReader;
}
