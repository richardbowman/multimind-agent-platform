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

export async function initializeBackend(settingsManager: SettingsManager, options: { 
    reindex?: boolean,
    onProgress?: (message: string) => void 
} = {}): Promise<BackendServices> {
    const { onProgress } = options;

    const _s = settingsManager.getSettings();

    onProgress?.('Initializing LLM service...');
    const llmService = LLMServiceFactory.createService(_s);

    // Initialize the embedding and LLaMA models
    onProgress?.('Initializing embedding model...');
    await llmService.initializeEmbeddingModel(_s.embeddingModel);
    onProgress?.('Initializing chat model...');
    await llmService.initializeChatModel(_s.chatModel);

    const vectorDB = createVectorDatabase(_s.vectorDatabaseType, llmService);
    const artifactManager = new ArtifactManager(vectorDB);

    vectorDB.on("needsReindex", async () => {
        Logger.info("Reindexing");
        await artifactManager.indexArtifacts();
    });

    await vectorDB.initializeCollection(_s.chromaCollection);

    const dataDir = getDataPath();

    const chatStorage = new LocalChatStorage(path.join(dataDir, "chats.json"));
    const tasks = new SimpleTaskManager(path.join(dataDir, "tasks.json"));

    // Load previously saved tasks
    await tasks.load();
    await chatStorage.load();

    // Handle graceful shutdown
    async function shutdown() {
        console.log('Shutting down gracefully...');
        try {
            await tasks.save();
            await chatStorage.save();
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
        llmService,
        vectorDBService: vectorDB,
        taskManager: tasks,
        artifactManager,
        chatStorage,
        defaultChannelId: _s.defaultChannels["onboarding"],
        settingsManager: settingsManager
    });

    // if (settings.defaultChannels) {
    //     Object.entries(settings.defaultChannels).forEach(([name, id]) => {
    //         params.chatStorage.createChannel(id, `#${name}`);
    //         channelIds.push(id);
    //         Logger.info(`Registered channel: ${name} (${id})`);
    //     });
    // }
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
        llmLogger: llmService.getLogger(),
        logReader: new LogReader()
    };
}
