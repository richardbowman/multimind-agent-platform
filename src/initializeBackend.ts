import { LLMServiceFactory } from "./llm/LLMServiceFactory";
import { LocalChatStorage, LocalTestClient } from "./chat/localChatClient";
import SimpleTaskManager from "./test/simpleTaskManager";
import { ArtifactManager } from "./tools/artifactManager";
import { createVectorDatabase } from "./llm/vectorDatabaseFactory";
import Logger from "./helpers/logger";
import { AgentLoader } from "./utils/AgentLoader";
import { BackendServices } from "./types/BackendServices";
import { LogReader } from "./server/LogReader";
import { SettingsManager } from "./tools/settingsManager";
import { getDataPath } from "./helpers/paths";
import path from "path";
import { sleep } from "./utils/sleep";

export async function initializeBackend(settingsManager: SettingsManager, options: { 
    reindex?: boolean
} = {}): Promise<BackendServices> {

    const _s = settingsManager.getSettings();

    Logger.progress('Initializing LLM services...', 0.1);
    const chatService = LLMServiceFactory.createService(_s);
    const embeddingService = LLMServiceFactory.createEmbeddingService(_s);
    await sleep();

    // Initialize the models
    try {
        Logger.progress('Initializing embedding model...', 0.2);
        await embeddingService.initializeEmbeddingModel(_s.models.embeddings[_s.providers.embeddings]);
        Logger.progress('Initializing chat model...', 0.3);
        await chatService.initializeChatModel(_s.models.conversation[_s.providers.chat]);
    } catch (error) {
        throw error;
    }
    await sleep();

    Logger.progress('Loading vector database', 0.3);
    const vectorDB = createVectorDatabase(_s.vectorDatabaseType, embeddingService, chatService);
    const artifactManager = new ArtifactManager(vectorDB);

    await sleep();

    vectorDB.on("needsReindex", async () => {
        Logger.progress("Reindexing vector database", 0.4);
        await artifactManager.indexArtifacts();
    });

    await vectorDB.initializeCollection(_s.chromaCollection);

    const dataDir = getDataPath();

    const chatStorage = new LocalChatStorage(path.join(dataDir, "chats.json"));
    const tasks = new SimpleTaskManager(path.join(dataDir, "tasks.json"));

    // Load previously saved tasks
    Logger.progress("Loading tasks", 0.6);
    await tasks.load();
    await sleep();

    Logger.progress("Loading chats", 0.6);
    await chatStorage.load();
    await sleep();

    // Handle graceful shutdown
    async function shutdown() {
        console.log('Shutting down gracefully...');
        try {
            await tasks.save();
            await chatStorage.save();
            if (chatService.shutdown) await chatService.shutdown();
            process.exit(0);
        } catch (error) {
            console.error('Error during shutdown:', error);
            process.exit(1);
        }
    }

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

    // Load all agents dynamically
    const agents = await AgentLoader.loadAgents({
        llmService: chatService,
        vectorDBService: vectorDB,
        taskManager: tasks,
        artifactManager,
        chatStorage,
        defaultChannelId: _s.defaultChannels["onboarding"],
        settingsManager: settingsManager
    });

      if (!Object.values(chatStorage.channelNames).includes("#welcome")) {
        await chatStorage.createChannel({
            name: "#welcome",
            description: "This is where we'll get started",
            members: [_s.agents["OnboardingConsultant"].userId],
            defaultResponderId: _s.agents["OnboardingConsultant"].userId
        });
    }

    // Initialize all agents
    for (const [name, agent] of agents.entries()) {
        if (agent.initialize) {
            await agent.initialize();
            Logger.info(`Initialized agent: ${name}`);
        }
    }

    chatStorage.announceChannels();

    const USER_ID = "test";
    const userClient = new LocalTestClient(USER_ID, "test", chatStorage);

    // Handle reindex option
    if (options.reindex) {
        Logger.info("Reindexing artifacts...");
        await artifactManager.indexArtifacts();
        process.exit(0);
    }

    return {
        chatClient: userClient,
        taskManager: tasks,
        artifactManager,
        settingsManager,
        llmLogger: chatService.getLogger(),
        logReader: new LogReader(),
        llmService: chatService,
        vectorDB,
        cleanup: shutdown,
    };
}
