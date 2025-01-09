import { LocalTestClient } from "../chat/localChatClient";
import SimpleTaskManager from "../test/simpleTaskManager";
import { ArtifactManager } from "../tools/artifactManager";
import { LLMCallLogger } from "../llm/LLMLogger";
import Logger from "../helpers/logger";
import { LLMProvider } from "../llm/LLMServiceFactory";
import { ChatClient } from "src/chat/chatClient";
import { TaskManager } from "src/tools/taskManager";
import { LogReader } from "src/server/LogReader";
import { SettingsManager } from "../tools/settingsManager";

export interface BackendSettings {
    provider: LLMProvider;
    model: string;
    apiKey: string;
}

export interface BackendServices {
    chatClient: ChatClient;
    taskManager: TaskManager;
    artifactManager: ArtifactManager;
    settings: BackendSettings;
    settingsManager: SettingsManager;
    llmLogger: LLMCallLogger;
    logReader: LogReader;
}
