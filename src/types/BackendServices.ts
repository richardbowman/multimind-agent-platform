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
import { AppUpdater } from "electron-updater";
import { Agent } from "http";
import { Agents } from "src/utils/AgentLoader";

export interface BackendServicesWithWindows extends BackendServices {
    type: "full",
    mainWindow: MainWindow;
    autoUpdater: AppUpdater;
}

export interface BackendServicesConfigNeeded extends BackendServicesOnly {
    type: "configNeeded",
    mainWindow: MainWindow;
    error: ConfigurationError
    autoUpdater: AppUpdater;
}

export interface BackendServices extends BackendServicesOnly {
    cleanup(): Promise<void>;
    chatClient: ChatClient;
    taskManager: TaskManager;
    artifactManager: ArtifactManager;
    llmService: ILLMService;
    vectorCollections: IVectorDatabase[];
    llmLogger: LLMCallLogger;
    agents: Agents;
}

export interface BackendServicesOnly {
    settingsManager: SettingsManager;
    logReader: LogReader;
}
