require('../register-paths');
import { ResearchManager } from "./agents/researchManager";
import { CHAT_MODEL, CHROMA_COLLECTION, EMBEDDING_MODEL, LLM_PROVIDER, VECTOR_DATABASE_TYPE, RESEARCH_MANAGER_TOKEN_ID as RESEARCH_MANAGER_TOKEN_ID, RESEARCH_MANAGER_USER_ID as RESEARCH_MANAGER_USER_ID, PROJECT_MANAGER_USER_ID, PROJECTS_CHANNEL_ID, RESEARCHER_USER_ID, WEB_RESEARCH_CHANNEL_ID, ONBOARDING_CHANNEL_ID, ONBOARDING_CONSULTANT_USER_ID, CONTENT_CREATION_CHANNEL_ID, SOLVER_AGENT_USER_ID, SOLVER_CHANNEL_ID } from "./helpers/config";
import { parseArgs } from 'node:util';
import { SolverAgent } from "./agents/solverAgent";
import { LLMServiceFactory, LLMProvider } from "./llm/LLMServiceFactory";
import ResearchAssistant from "./agents/researchAssistant";
import { ContentManager } from "./agents/contentManager";
import { CONTENT_MANAGER_USER_ID, CONTENT_WRITER_USER_ID } from "./helpers/config";
import { InMemoryChatStorage, InMemoryTestClient } from "./chat/inMemoryChatClient";
import { ContentWriter } from "./agents/contentWriter";
import SimpleTaskManager from "./test/simpleTaskManager";
import { ArtifactManager } from "./tools/artifactManager";
import { createVectorDatabase } from "./llm/vectorDatabaseFactory";
import { ProjectManager } from "./agents/projectManager";
import Logger from "./helpers/logger";
import OnboardingConsultant from "./agents/onboardingConsultant";
import { WebSocketServer } from './web/server/WebSocketServer';

export async function initializeBackend() {
    const llmService = LLMServiceFactory.createService(LLM_PROVIDER as LLMProvider);
    // Initialize the embedding and LLaMA models
    await llmService.initializeEmbeddingModel(EMBEDDING_MODEL);
    await llmService.initializeLlamaModel(CHAT_MODEL);

    const vectorDB = createVectorDatabase(VECTOR_DATABASE_TYPE, llmService);
    const artifactManager = new ArtifactManager(vectorDB);

    vectorDB.on("needsReindex", async () => {
        Logger.info("Reindexing");
        await artifactManager.indexArtifacts();
    });

    await vectorDB.initializeCollection(CHROMA_COLLECTION);

    const storage = new InMemoryChatStorage(".output/chats.json");
    const tasks = new SimpleTaskManager(".output/tasks.json");

    // Load previously saved tasks
    await tasks.load();
    await storage.load();

    storage.registerChannel(ONBOARDING_CHANNEL_ID, "#onboarding");
    storage.registerChannel(PROJECTS_CHANNEL_ID, "#projects");
    storage.registerChannel(WEB_RESEARCH_CHANNEL_ID, "#research");
    storage.registerChannel(CONTENT_CREATION_CHANNEL_ID, "#content");
    //storage.registerChannel(FACT_CHECK_CHANNEL_ID, "#fact-check");
    storage.registerChannel(SOLVER_CHANNEL_ID, "#solver");


    // Handle graceful shutdown
    async function shutdown() {
        console.log('Shutting down gracefully...');
        try {
            await wsServer.close();
            await tasks.save();
            await storage.save();
            process.exit(0);
        } catch (error) {
            console.error('Error during shutdown:', error);
            process.exit(1);
        }
    }

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

    // Create planners for each agent
    const researchClient = new InMemoryTestClient(RESEARCHER_USER_ID, "test", storage);
    const researcher = new ResearchAssistant({
        userId: RESEARCHER_USER_ID,
        messagingHandle: RESEARCH_MANAGER_TOKEN_ID,
        chatClient: researchClient,
        llmService: llmService,
        taskManager: tasks,
        vectorDBService: vectorDB
    });
    await researcher.initialize();

    const researchManagerClient = new InMemoryTestClient(RESEARCH_MANAGER_USER_ID, "test", storage);
    const researchManager = new ResearchManager({
        userId: RESEARCH_MANAGER_USER_ID,
        messagingHandle: RESEARCH_MANAGER_TOKEN_ID,
        chatClient: researchManagerClient,
        llmService: llmService,
        taskManager: tasks,
        vectorDBService: vectorDB
    });
    await researchManager.initialize();

    const contentClient = new InMemoryTestClient(CONTENT_MANAGER_USER_ID, "test", storage);
    const contentAssistant = new ContentManager({
        chatClient: contentClient,
        llmService: llmService,
        userId: CONTENT_MANAGER_USER_ID,
        taskManager: tasks,
        vectorDBService: vectorDB
    });
    await contentAssistant.initialize();

    const writerClient = new InMemoryTestClient(CONTENT_WRITER_USER_ID, "test", storage);
    const writerAssistant = new ContentWriter({
        userId: CONTENT_WRITER_USER_ID,
        messagingHandle: "@writer",
        chatClient: writerClient,
        llmService: llmService,
        taskManager: tasks,
        vectorDBService: vectorDB
    });

    const pmClient = new InMemoryTestClient(PROJECT_MANAGER_USER_ID, "test", storage);
    const pmAssistant = new ProjectManager({
        userId: PROJECT_MANAGER_USER_ID,
        messagingHandle: "@pm",
        chatClient: pmClient,
        llmService: llmService,
        vectorDBService: vectorDB,
        taskManager: tasks
    });

    const onboardingClient = new InMemoryTestClient(ONBOARDING_CONSULTANT_USER_ID, "test", storage);
    const onboardingAssistant = new OnboardingConsultant({
        chatClient: onboardingClient,
        llmService: llmService,
        userId: ONBOARDING_CONSULTANT_USER_ID,
        taskManager: tasks,
        vectorDBService: vectorDB
    });
    await onboardingAssistant.initialize();

    // const factCheckerClient = new InMemoryTestClient(FACT_CHECKER_USER_ID, "test", storage);
    // const factChecker = new FactChecker(factCheckerClient, llmService, tasks);
    // factChecker.setupChatMonitor(FACT_CHECK_CHANNEL_ID, "@factcheck");

    // Initialize Solver Agent
    const solverClient = new InMemoryTestClient(SOLVER_AGENT_USER_ID, "test", storage);
    const solverAgent = new SolverAgent({
        chatClient: solverClient,
        llmService: llmService,
        userId: SOLVER_AGENT_USER_ID,
        taskManager: tasks,
        vectorDBService: vectorDB
    });
    await solverAgent.initialize();

    const USER_ID = "test";
    const userClient = new InMemoryTestClient(USER_ID, "test", storage);
    //await setupUserAgent(userClient, storage, chatBox, inputBox, artifactManager, tasks);

    const wsServer = new WebSocketServer(storage, tasks, artifactManager, userClient);

    // Parse command line arguments
    const { values } = parseArgs({
        options: {
            reindex: { type: 'boolean' }
        }
    });

    // Handle reindex flag
    if (values.reindex) {
        Logger.info("Reindexing artifacts...");
        await artifactManager.indexArtifacts();
        process.exit(0);
    }

    return {
        storage,
        tasks,
        artifactManager,
        wsServer,
        researcher,
        researchManager,
        contentAssistant,
        writerAssistant,
        pmAssistant,
        onboardingAssistant,
        solverAgent
    };
}

initializeBackend();

// const project = await tasks.getProject("58b88241-5bf8-4e74-9184-963baa9d7664");

// const results = await researchManager.aggregateResults({
//     id: project.id,
//     name: "The user wants to research indie music concerts in Chicago from January to March 2025."
// });

// const report = await researchManager.createFinalReport(project, results);

// console.log(report);


