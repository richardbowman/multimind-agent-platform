import { LLMServiceFactory } from "./llm/LLMServiceFactory";
import { LocalChatStorage, LocalTestClient } from "./chat/localChatClient";
import SimpleTaskManager from "./test/simpleTaskManager";
import { ArtifactManager } from "./tools/artifactManager";
import { createVectorDatabase } from "./llm/vectorDatabaseFactory";
import Logger from "./helpers/logger";
import { AgentLoader, Agents } from "./utils/AgentLoader";
import { BackendServices } from "./types/BackendServices";
import { LogReader } from "./server/LogReader";
import { SettingsManager } from "./tools/settingsManager";
import { getDataPath } from "./helpers/paths";
import path from "path";
import { sleep } from "./utils/sleep";
import { ServerRPCHandler } from "./server/RPCHandler";
import { createUUID, UUID } from "./types/uuid";
import { ConfigurationError } from "./errors/ConfigurationError";
import { Agent } from "./agents/agents";
import { createChannelHandle } from "./shared/channelTypes";

export async function initializeBackend(settingsManager: SettingsManager, options: { 
    reindex?: boolean
} = {}): Promise<BackendServices> {

    const _s = settingsManager.getSettings();

    Logger.progress('Initializing LLM services...', 0.1);
    const embeddingService = LLMServiceFactory.createEmbeddingService(_s);
    const chatService = LLMServiceFactory.createService(_s);
    await sleep();

    // Initialize the models
    try {
        if (!_s.providers.embeddings) {
            throw new ConfigurationError("No embeddings model provider is selected");
        }
        if (!_s.models.embeddings[_s.providers.embeddings]) {
            throw new ConfigurationError("No embeddings model is selected");
        }

        if (!_s.providers.chat) {
            throw new ConfigurationError("No chat provider is selected");
        }
        if (!_s.models.conversation[_s.providers.chat]) {
            throw new ConfigurationError("No chat model is selected");
        }

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
    async function shutdown() : Promise<void> {
        console.log('Shutting down gracefully...');
        try {
            if (chatService.shutdown) await chatService.shutdown();
            process.exit(0);
        } catch (error) {
            console.error('Error during shutdown:', error);
            process.exit(1);
        }
    }

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
    
    const agents : Agents = {agents: {}};

    // Load all agents dynamically
    const agentObjects = await AgentLoader.loadAgents({
        llmService: chatService,
        vectorDBService: vectorDB,
        taskManager: tasks,
        artifactManager,
        chatStorage,
        settingsManager: settingsManager,
        agents: agents
    });

    // Initialize all agents
    for (const [name, agent] of agentObjects.entries()) {
        if (agent.initialize) {
            await agent.initialize();
            Logger.info(`Initialized agent: ${name}`);
        }
        agents.agents[agent.userId] = agent;
    }

    chatStorage.announceChannels();

    const USER_ID = createUUID("bd1c9698-ce26-41e4-819f-83982891456e");
    const userClient = new LocalTestClient(USER_ID, "@user", chatStorage);
    userClient.registerHandle("@user");

    if (!Object.values(chatStorage.channelNames).includes("#general")) {
        // Create RPC handler and use it to create channel
        const mappedParams = await ServerRPCHandler.createChannelHelper(userClient, tasks, {
            name: createChannelHandle("#general"),
            description: "A place to just chat with a simple agent.",
            goalTemplate: createChannelHandle('#general')
        });
        await userClient.createChannel(mappedParams);
    }

    if (!Object.values(chatStorage.channelNames).includes("#onboarding")) {
        // Create RPC handler and use it to create channel
        const mappedParams = await ServerRPCHandler.createChannelHelper(userClient, tasks, {
            name: createChannelHandle("#onboarding"),
            description: "The on-boarding agent will help configure more channels based on your needs.",
            goalTemplate: createChannelHandle('#onboarding')
        });
        await userClient.createChannel(mappedParams);
    }

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
        agents
    };
}
