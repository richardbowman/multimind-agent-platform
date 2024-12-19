require('./register-paths');

import { ResearchManager } from "./agents/researchManager";
import { CHAT_MODEL, CHROMA_COLLECTION, EMBEDDING_MODEL, LLM_PROVIDER, VECTOR_DATABASE_TYPE, RESEARCH_MANAGER_TOKEN_ID as RESEARCH_MANAGER_TOKEN_ID, RESEARCH_MANAGER_USER_ID as RESEARCH_MANAGER_USER_ID, PROJECT_MANAGER_USER_ID, PROJECTS_CHANNEL_ID, RESEARCHER_USER_ID, WEB_RESEARCH_CHANNEL_ID, ONBOARDING_CHANNEL_ID, ONBOARDING_CONSULTANT_USER_ID, CONTENT_CREATION_CHANNEL_ID, SOLVER_AGENT_USER_ID, SOLVER_CHANNEL_ID } from "./helpers/config";
import { parseArgs } from 'node:util';
import { LLMServiceFactory, LLMProvider } from "./llm/LLMServiceFactory";
import ResearchAssistant from "./agents/researchAssistant";
import { ContentManager } from "./agents/contentManager";
import { CONTENT_MANAGER_USER_ID, CONTENT_WRITER_USER_ID } from "./helpers/config";
import { InMemoryChatStorage, InMemoryTestClient } from "./chat/inMemoryChatClient";
import { ContentWriter } from "./agents/contentWriter";
import SimpleTaskManager from "./test/simpleTaskManager";
import { ArtifactManager } from "./tools/artifactManager";
import { createVectorDatabase } from "./llm/vectorDatabaseFactory";
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

    // Load all agents dynamically
    const agents = await AgentLoader.loadAgents({
        llmService,
        vectorDBService: vectorDB,
        taskManager: tasks,
        artifactManager
    });

    // Initialize all agents
    for (const [name, agent] of agents.entries()) {
        if (agent.initialize) {
            await agent.initialize();
            Logger.info(`Initialized agent: ${name}`);
        }
    }

    // Initialize WebSocket server with our storage
    import { WebSocketServer } from './web/server/WebSocketServer';

    const USER_ID = "test";
    const userClient = new InMemoryTestClient(USER_ID, "test", storage);
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
}

// Run the main function
initializeBackend().catch(error => {
    Logger.error('Error in main:', error);
    process.exit(1);
});

// const project = await tasks.getProject("58b88241-5bf8-4e74-9184-963baa9d7664");

// const results = await researchManager.aggregateResults({
//     id: project.id,
//     name: "The user wants to research indie music concerts in Chicago from January to March 2025."
// });

// const report = await researchManager.createFinalReport(project, results);

// console.log(report);


