import { LocalTestClient } from "../chat/localChatClient";
import SimpleTaskManager from "../test/simpleTaskManager";
import { ArtifactManager } from "../tools/artifactManager";
import { LLMCallLogger } from "../llm/LLMLogger";
import Logger from "../helpers/logger";
import { LLMProvider } from "../llm/LLMServiceFactory";

export interface BackendSettings {
    provider: LLMProvider;
    model: string;
    apiKey: string;
}

export interface BackendServices {
    chatClient: LocalTestClient;
    taskManager: SimpleTaskManager;
    artifactManager: ArtifactManager;
    settings: BackendSettings;
    llmLogger: LLMCallLogger;
    logReader: typeof Logger;
}
