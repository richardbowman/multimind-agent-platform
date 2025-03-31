import { LLMServiceFactory } from "./llm/LLMServiceFactory";
import { ModelType } from "./llm/types/ModelType";
import { LocalChatStorage, LocalTestClient } from "./chat/localChatClient";
import SimpleTaskManager from "./tools/simpleTaskManager";
import { ArtifactManager } from "./tools/artifactManager";
import { createVectorDatabase } from "./llm/vectorDatabaseFactory";
import Logger from "./helpers/logger";
import { AgentLoader, Agents } from "./utils/AgentLoader";
import { BackendServices } from "./types/BackendServices";
import { LogReader } from "./server/LogReader";
import { SettingsManager } from "./tools/settingsManager";
import { getDataPath } from "./helpers/paths";
import path from "node:path";
import { sleep } from "./utils/sleep";
import { ServerRPCHandler } from "./server/ServerRPCHandler";
import { asUUID, createUUID } from "./types/uuid";
import { ConfigurationError } from "./errors/ConfigurationError";
import { createChannelHandle } from "./shared/channelTypes";
import { app } from "electron";
import { Message } from "./chat/chatClient";
import _crypto from 'node:crypto';
import { loadAgentConfigs, loadProcedureGuides, loadTemplates } from "./tools/assetLoader";
import { Sequelize } from "sequelize";
import { Settings } from "./tools/settings";
import { ILLMService, LLMProviders, LLMServices } from "./llm/ILLMService";
import { LLMProvider } from "./llm/types/LLMProvider";
import { asError } from "./types/types";
import "./utils/ArrayUtils";    // need to import because we change array prototype

if (!global.crypto) {
    global.crypto = _crypto;
}

declare global {
    interface Array<T> {
        defined(): Array<T>;
    }
}

async function createLLMProviders(settings: Settings): Promise<LLMProviders> {
    const providerInstances: LLMProviders = {};
    
    for(const config of settings.providers) {
        const service = LLMServiceFactory.createService(settings, config);
        providerInstances[config.type] = service;
    }
    
    return providerInstances;
}

async function createLLMServices(providers: LLMProviders, settings: Settings): Promise<LLMServices> {
    const services: LLMServices = {};

    const enabledConfigs = settings.modelConfigs.filter(c => c.enabled && c.type !== ModelType.EMBEDDINGS);

    for (const config of enabledConfigs) {
        try {
            if (config.type && !Object.values(ModelType).includes(config.type)) {
                Logger.info(`Invalid model type ${config.type} service for provider ${config.provider}, skipping...`);
                continue;
            }
            if (config.provider && !Object.values(LLMProvider).includes(config.provider)) {
                Logger.info(`Invalid provider ${config.provider}, skipping...`);
                continue;
            }

            let service = providers[config.provider!];
            if (!service) {
                throw new Error(`Provider ${config.provider} could not be found.`);
            }

            // Initialize the specific model
            await service.initializeChatModel(config.model!);
            
            // Store the service using a combination of type and provider as the key
            const serviceKey = config.type;
            services[serviceKey] = service;
            
            Logger.info(`Initialized ${config.type} service for provider ${config.provider}`);
        } catch (error) {
            const msg = `Failed to initialize ${config.type} service for provider ${config.provider}: ${asError(error).message}`;
            Logger.error(msg, error);
            throw new ConfigurationError(msg);
        }
    }
    
    return services;
}

export async function initializeBackend(settingsManager: SettingsManager, options: {
    reindex?: boolean
} = {}): Promise<BackendServices> {

    const _s = settingsManager.getSettings();
    
    // Initialize the models
    try {
        //TODO: bring back this validation


        // if (!_s.providers.chat) {
        //     throw new ConfigurationError("No chat provider is selected");
        // }
        // if (!_s.models.conversation[_s.providers.chat]) {
        //     throw new ConfigurationError("No chat model is selected");
        // }

        //        Logger.progress('Initializing LLM services...', 0.1);


        const embeddingConfig = _s.modelConfigs.find(c => c.enabled && c.type === ModelType.EMBEDDINGS);

        if (!embeddingConfig) {
            throw new ConfigurationError("No embeddings model configuration avaiable.");
        }

        const embeddingProvider = _s.providers.find(p => p.type === embeddingConfig.provider);

        if (!embeddingProvider) {
            throw new ConfigurationError("No embeddings provider matches the embedding configuration");
        }

        const embeddingService = LLMServiceFactory.createEmbeddingService(_s, embeddingProvider);
        Logger.progress('Initializing embedding model...', 0.2, "loading");


        await embeddingService.initializeEmbeddingModel(embeddingConfig.model);

        await sleep();

        Logger.progress('Initializing chat model...', 0.3, "loading");
        
        const providers = await createLLMProviders(_s);
        
        // Create all configured LLM services
        const llmServices = await createLLMServices(providers, _s);
        
        // Get the primary chat service
        const chatService = llmServices.conversation;
        if (!chatService) {
            throw new ConfigurationError(`No chat service found for provider ${_s.providers.chat}`);
        }
        await sleep();

        Logger.progress('Loading vector database', 0.3, "loading");
        const docsVectorDB = createVectorDatabase(_s.vectorDatabaseType, embeddingService, chatService);
        const proceduresVectorDB = createVectorDatabase(_s.vectorDatabaseType, embeddingService, chatService);

        const artifactManager = new ArtifactManager(docsVectorDB, proceduresVectorDB, chatService);
        await artifactManager.initialize();

        await sleep();

        docsVectorDB.on("needsReindex", async () => {
            Logger.progress("Reindexing vector database", 0.4, "loading");
            await artifactManager.indexArtifacts();
        });

        await docsVectorDB.initializeCollection(_s.chromaCollection);
        await proceduresVectorDB.initializeCollection("procedures");

        const tasks = new SimpleTaskManager();
        await tasks.initialize();

        // Load previously saved tasks
        Logger.progress("Loading tasks", 0.6, "loading");
        await tasks.load();
        await sleep();

        Logger.progress("Loading chats", 0.6, "loading");
        const sequelize = new Sequelize({
            dialect: 'sqlite',
            storage: path.join(getDataPath(), 'chat.db'),
            logging: msg => Logger.verbose(msg)
        });

        const chatStorage = new LocalChatStorage(sequelize);
        await chatStorage.sync();
        await sleep();

        // Handle graceful shutdown
        async function shutdown(): Promise<void> {
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

        // Handle reindex option
        if (options.reindex) {
            Logger.info("Reindexing artifacts...");
            await artifactManager.indexArtifacts();
            process.exit(0);
        }

        // Load procedure guides
        const guidesDir = path.join('dist', 'assets', "procedure-guides");
        const templatesDir = path.join('dist', 'assets', "templates");
        const agentsDir = path.join('dist', 'assets', "agents");

        await loadProcedureGuides(app.getAppPath(), guidesDir, artifactManager);
        await loadTemplates(app.getAppPath(), templatesDir, artifactManager);
        await loadAgentConfigs(app.getAppPath(), agentsDir, artifactManager);

        const agents: Agents = { agents: {} };

        // Load all agents dynamically
        const jsonAgentObjects = await AgentLoader.loadAgents({
            llmServices,
            taskManager: tasks,
            artifactManager,
            chatStorage,
            settingsManager,
            agents
        });

        // Load all agents dynamically
        const markdownAgentObjects = await AgentLoader.loadMarkdownConfigurableAgents({
            llmServices,
            taskManager: tasks,
            artifactManager,
            chatStorage,
            settingsManager,
            agents
        });

        const agentObjects = [...jsonAgentObjects.entries(), ...markdownAgentObjects.entries()];

        // Initialize all agents
        let i = 1, total = Object.keys(agentObjects).length;
        for (const [name, agent] of agentObjects) {
            Logger.progress(`Initializing ${name} agent...`, (i / total));
            if (agent.initialize) {
                await agent.initialize();
                Logger.info(`Initialized agent: ${name}`);
            }
            agents.agents[agent.userId] = agent;
            i++;
        }

        chatStorage.announceChannels();

        const USER_ID = createUUID("bd1c9698-ce26-41e4-819f-83982891456e");
        const userClient = new LocalTestClient(USER_ID, "@user", chatStorage);
        userClient.registerHandle("@user");

        const channels = await chatStorage.getChannels();

        if (!channels.find(c => c.name === "#general")) {
            // Create RPC handler and use it to create channel
            const mappedParams = await ServerRPCHandler.createChannelHelper(userClient, tasks, {
                name: createChannelHandle("#general"),
                description: "A place to just chat with a simple agent.",
                goalTemplate: createChannelHandle('#general')
            });
            await userClient.createChannel(mappedParams);
        }

        if (!channels.find(c => c.name === "#onboarding")) {
            // Create RPC handler and use it to create channel
            const mappedParams = await ServerRPCHandler.createChannelHelper(userClient, tasks, {
                name: createChannelHandle("#onboarding"),
                description: "The on-boarding agent will help configure more channels based on your needs.",
                goalTemplate: createChannelHandle('#onboarding')
            });
            await userClient.createChannel(mappedParams);
        }

        tasks.on("taskMissedDueDate", async ({ projectId, task, dueDate }) => {
            const assignedAgent = agents.agents[task.assignee];
            if (assignedAgent) {
                assignedAgent.processTaskQueue();
            } else if (task.assignee === USER_ID) {
                let post: Message | undefined = undefined;
                if (task.props?.announceChannelId !== undefined) {
                    const handles = await userClient.getHandles();
                    const creatorHandle = handles[task.creator];
                    const assigneeHandle = task.assignee && handles[task.assignee];
                    const channelId = asUUID(task.props.announceChannelId);
                    await tasks.markTaskInProgress(task);
                    await userClient.postInChannel(channelId,
                        `@user This is a scheduled task reminder for the task ${task.id} created by ${creatorHandle} ${task.description} ${assigneeHandle ? `assigned to ${assigneeHandle}` : ''}}`);
                }
            }
        })
        tasks.startScheduler();

        // Initialize all agents
        for (const [name, agent] of agentObjects.entries()) {
            if (agent.onReady) {
                await agent.onReady();
                Logger.info(`Initialized agent: ${name}`);
            }
        }

        return {
            chatClient: userClient,
            taskManager: tasks,
            artifactManager,
            settingsManager,
            llmLogger: chatService.getLogger(),
            logReader: new LogReader(),
            llmService: chatService,
            vectorCollections: [docsVectorDB, proceduresVectorDB],
            cleanup: shutdown,
            agents
        };
    } catch (error) {
        throw error;
    }


}
