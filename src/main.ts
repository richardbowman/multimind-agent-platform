import { ResearchManager } from "./agents/researchManager";
import { CHAT_MODEL, CHROMA_COLLECTION, EMBEDDING_MODEL, RESEARCH_MANAGER_TOKEN_ID as RESEARCH_MANAGER_TOKEN_ID, RESEARCH_MANAGER_USER_ID as RESEARCH_MANAGER_USER_ID, PROJECT_MANAGER_USER_ID, PROJECTS_CHANNEL_ID, RESEARCHER_USER_ID, WEB_RESEARCH_CHANNEL_ID, ONBOARDING_CHANNEL_ID, ONBOARDING_CONSULTANT_USER_ID } from "./helpers/config";
import LMStudioService from "./llm/lmstudioService";
import ResearchAssistant from "./agents/researchAssistant";
import { chatBox, inputBox } from "./test/ui";
import { ContentManager } from "src/agents/contentManager";
import { setupUserAgent } from './test/userClient';
import { CONTENT_MANAGER_USER_ID, CONTENT_WRITER_USER_ID } from "./helpers/config";
import { InMemoryChatStorage, InMemoryTestClient } from "./chat/testClient";
import { ContentWriter } from "./agents/contentWriter";
import SimpleTaskManager from "./test/simpleTaskManager";
import { ArtifactManager } from "./tools/artifactManager";
import ChromaDBService from "./llm/chromaService";
import { ProjectManager } from "./agents/projectManager";
import { OnboardingConsultant } from "./agents/onboardingConsultant";

const lmStudioService = new LMStudioService();
// Initialize the embedding and LLaMA models
await lmStudioService.initializeEmbeddingModel(EMBEDDING_MODEL);
await lmStudioService.initializeLlamaModel(CHAT_MODEL);

const chromaService = new ChromaDBService(lmStudioService);
await chromaService.initializeCollection(CHROMA_COLLECTION);

const artifactManager = new ArtifactManager(chromaService);

const storage = new InMemoryChatStorage(".output/chats.json");
const tasks = new SimpleTaskManager(".output/tasks.json");

// Load previously saved tasks
await tasks.load();
await storage.load();

storage.registerChannel(ONBOARDING_CHANNEL_ID, "#onboarding");
storage.registerChannel(PROJECTS_CHANNEL_ID, "#projects");
storage.registerChannel(WEB_RESEARCH_CHANNEL_ID, "#research");

process.on("exit", async () => {
    console.log('Saving tasks before exiting...');
    //await tasks.save();
    //await storage.save();
});

const researchClient = new InMemoryTestClient(RESEARCHER_USER_ID, "test", storage);
export const researcher = new ResearchAssistant(RESEARCH_MANAGER_TOKEN_ID, RESEARCHER_USER_ID, researchClient, lmStudioService, tasks);
await researcher.initialize();

const researchManagerClient = new InMemoryTestClient(RESEARCH_MANAGER_USER_ID, "test", storage);
const researchManager = new ResearchManager(RESEARCH_MANAGER_TOKEN_ID, RESEARCH_MANAGER_USER_ID, researchManagerClient, lmStudioService, tasks);
await researchManager.initialize();

const contentClient = new InMemoryTestClient(CONTENT_MANAGER_USER_ID, "test", storage);
const contentAssistant = new ContentManager("", CONTENT_MANAGER_USER_ID, contentClient, lmStudioService, tasks);
await contentAssistant.initialize();

const writerClient = new InMemoryTestClient(CONTENT_WRITER_USER_ID, "test", storage);
const writerAssistant = new ContentWriter(writerClient, lmStudioService, tasks, chromaService);

const pmClient = new InMemoryTestClient(PROJECT_MANAGER_USER_ID, "test", storage);
const pmAssistant = new ProjectManager(PROJECT_MANAGER_USER_ID, "@pm", pmClient, lmStudioService, chromaService, tasks);

const onboardingClient = new InMemoryTestClient(ONBOARDING_CONSULTANT_USER_ID, "test", storage);
const onboardingAssistant = new OnboardingConsultant(ONBOARDING_CONSULTANT_USER_ID, "@onboarding", onboardingClient, lmStudioService, chromaService, tasks);

setupUserAgent(storage, chatBox, inputBox, artifactManager, tasks);
