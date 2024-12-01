import { ResearchManager } from "./agents/researchManager";
import { CHAT_MODEL, EMBEDDING_MODEL, ORCHESTRATOR_TOKEN_ID, ORCHESTRATOR_USER_ID, RESEARCHER_USER_ID } from "./helpers/config";
import LMStudioService from "./llm/lmstudioService";
import ResearchAssistant from "./agents/assistant";
import { chatBox, inputBox } from "./test/ui";
import { ContentManager } from "src/agents/contentManager";
import { setupUserAgent } from './test/userClient';
import { CONTENT_MANAGER_USER_ID, CONTENT_WRITER_USER_ID } from "./helpers/config";
import { InMemoryChatStorage, InMemoryTestClient } from "./chat/testClient";
import { ContentWriter } from "./agents/contentWriter";
import SimpleTaskManager from "./test/simpleTaskManager";

const lmStudioService = new LMStudioService();

// Initialize the embedding and LLaMA models
await lmStudioService.initializeEmbeddingModel(EMBEDDING_MODEL);
await lmStudioService.initializeLlamaModel(CHAT_MODEL);



const storage = new InMemoryChatStorage();
const tasks = new SimpleTaskManager(".output/tasks.json");

const researchClient = new InMemoryTestClient(RESEARCHER_USER_ID, "test", storage);
export const researcher = new ResearchAssistant(ORCHESTRATOR_TOKEN_ID, RESEARCHER_USER_ID, researchClient, lmStudioService, tasks);
await researcher.initialize();

const orchestratorClient = new InMemoryTestClient(ORCHESTRATOR_USER_ID, "test", storage);
const orchestrator = new ResearchManager(ORCHESTRATOR_TOKEN_ID, ORCHESTRATOR_USER_ID, orchestratorClient, lmStudioService, tasks);
await orchestrator.initialize();

const contentClient = new InMemoryTestClient(CONTENT_MANAGER_USER_ID, "test", storage);
const contentAssistant = new ContentManager("", CONTENT_MANAGER_USER_ID, contentClient, lmStudioService, tasks);
await contentAssistant.initialize();

const writerClient = new InMemoryTestClient(CONTENT_WRITER_USER_ID, "test", storage);
const writerAssistant = new ContentWriter(writerClient, lmStudioService, tasks);
await writerAssistant.initialize();

setupUserAgent(storage, chatBox, inputBox);