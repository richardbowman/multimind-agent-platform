import { ResearchManager } from "./agents/researchManager";
import { CHAT_MODEL, CHROMA_COLLECTION, EMBEDDING_MODEL, LLM_PROVIDER, RESEARCH_MANAGER_TOKEN_ID as RESEARCH_MANAGER_TOKEN_ID, RESEARCH_MANAGER_USER_ID as RESEARCH_MANAGER_USER_ID, PROJECT_MANAGER_USER_ID, PROJECTS_CHANNEL_ID, RESEARCHER_USER_ID, WEB_RESEARCH_CHANNEL_ID, ONBOARDING_CHANNEL_ID, ONBOARDING_CONSULTANT_USER_ID, CONTENT_CREATION_CHANNEL_ID, FACT_CHECK_CHANNEL_ID, FACT_CHECKER_USER_ID, SOLVER_AGENT_USER_ID, SOLVER_AGENT_TOKEN, SOLVER_CHANNEL_ID } from "./helpers/config";
import { SolverAgent } from "./agents/solverAgent";
import { LLMServiceFactory, LLMProvider } from "./llm/LLMServiceFactory";
import ResearchAssistant from "./agents/researchAssistant";
import { chatBox, inputBox } from "./test/ui";
import { ContentManager } from "src/agents/contentManager";
import { setupUserAgent } from './test/userClient';
import { CONTENT_MANAGER_USER_ID, CONTENT_WRITER_USER_ID } from "./helpers/config";
import { InMemoryChatStorage, InMemoryTestClient } from "./chat/inMemoryChatClient";
import { ContentWriter } from "./agents/contentWriter";
import SimpleTaskManager from "./test/simpleTaskManager";
import { ArtifactManager } from "./tools/artifactManager";
import ChromaDBService from "./llm/chromaService";
import { ProjectManager } from "./agents/projectManager";
import { OnboardingConsultant } from "./agents/onboardingConsultant";
import { ConverseResponseFilterSensitiveLog } from "@aws-sdk/client-bedrock-runtime";
import { FactChecker } from "./agents/factChecker";
import Logger from "./helpers/logger";
import GoalBasedOnboardingConsultant from "./agents/goalBasedOnboardingConsultant";

const llmService = LLMServiceFactory.createService(LLM_PROVIDER as LLMProvider);
// Initialize the embedding and LLaMA models
await llmService.initializeEmbeddingModel(EMBEDDING_MODEL);
await llmService.initializeLlamaModel(CHAT_MODEL);

const chromaService = new ChromaDBService(llmService);
const artifactManager = new ArtifactManager(chromaService);

chromaService.on("needsReindex", async () => {
    Logger.info("Reindexing");
    await artifactManager.indexArtifacts();
});

await chromaService.initializeCollection(CHROMA_COLLECTION);


const storage = new InMemoryChatStorage(".output/chats.json");
const tasks = new SimpleTaskManager(".output/tasks.json");

// Load previously saved tasks
await tasks.load();
await storage.load();

storage.registerChannel(ONBOARDING_CHANNEL_ID, "#onboarding");
storage.registerChannel(PROJECTS_CHANNEL_ID, "#projects");
storage.registerChannel(WEB_RESEARCH_CHANNEL_ID, "#research");
storage.registerChannel(CONTENT_CREATION_CHANNEL_ID, "#content");
storage.registerChannel(FACT_CHECK_CHANNEL_ID, "#fact-check");
storage.registerChannel(SOLVER_CHANNEL_ID, "#solver");


process.on("exit", async () => {
    console.log('Saving tasks before exiting...');
    //await tasks.save();
    //await storage.save();
});

const researchClient = new InMemoryTestClient(RESEARCHER_USER_ID, "test", storage);
export const researcher = new ResearchAssistant(RESEARCH_MANAGER_TOKEN_ID, RESEARCHER_USER_ID, researchClient, llmService, tasks);
await researcher.initialize();

const researchManagerClient = new InMemoryTestClient(RESEARCH_MANAGER_USER_ID, "test", storage);
const researchManager = new ResearchManager(RESEARCH_MANAGER_TOKEN_ID, RESEARCH_MANAGER_USER_ID, researchManagerClient, llmService, tasks);
await researchManager.initialize();

const contentClient = new InMemoryTestClient(CONTENT_MANAGER_USER_ID, "test", storage);
const contentAssistant = new ContentManager("", CONTENT_MANAGER_USER_ID, contentClient, llmService, tasks);
await contentAssistant.initialize();

const writerClient = new InMemoryTestClient(CONTENT_WRITER_USER_ID, "test", storage);
const writerAssistant = new ContentWriter(writerClient, llmService, tasks, chromaService);

const pmClient = new InMemoryTestClient(PROJECT_MANAGER_USER_ID, "test", storage);
const pmAssistant = new ProjectManager(PROJECT_MANAGER_USER_ID, "@pm", pmClient, llmService, chromaService, tasks);

const onboardingClient = new InMemoryTestClient(ONBOARDING_CONSULTANT_USER_ID, "test", storage);
const onboardingAssistant = new GoalBasedOnboardingConsultant(ONBOARDING_CONSULTANT_USER_ID, "@onboarding", onboardingClient, llmService, chromaService, tasks);
await onboardingAssistant.initialize();

const factCheckerClient = new InMemoryTestClient(FACT_CHECKER_USER_ID, "test", storage);
const factChecker = new FactChecker(factCheckerClient, llmService, tasks);
factChecker.setupChatMonitor(FACT_CHECK_CHANNEL_ID, "@factcheck");

// Initialize Solver Agent
const solverClient = new InMemoryTestClient(SOLVER_AGENT_USER_ID, "test", storage);
const solverAgent = new SolverAgent(solverClient, llmService, SOLVER_AGENT_USER_ID, tasks);
await solverAgent.initialize();

setupUserAgent(storage, chatBox, inputBox, artifactManager, tasks);




// const project = await tasks.getProject("58b88241-5bf8-4e74-9184-963baa9d7664");

// const results = await researchManager.aggregateResults({
//     id: project.id,
//     name: "The user wants to research indie music concerts in Chicago from January to March 2025."
// });

// const report = await researchManager.createFinalReport(project, results);

// console.log(report);


