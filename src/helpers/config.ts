// config.ts
import dotenv from 'dotenv';
dotenv.config({ path: ['env.defaults', '.env.local', "./.env"] });

export const WEB_RESEARCH_CHANNEL_ID = process.env.WEB_RESEARCH_CHANNEL_ID!;
export const RESEARCHER_TOKEN = process.env.RESEARCHER_TOKEN!;
export const RESEARCHER_USER_ID = process.env.RESEARCHER_USER_ID!;

export const PROJECTS_CHANNEL_ID = process.env.PROJECTS_CHANNEL_ID!;

export const CONTENT_CREATION_CHANNEL_ID = process.env.CONTENT_CREATION_CHANNEL_ID!;
export const CONTENT_MANAGER_USER_ID = process.env.CONTENT_MANAGER_USER_ID!;
export const CONTENT_WRITER_USER_ID = process.env.CONTENT_WRITER_USER_ID!;

export const CHROMADB_URL = process.env.CHROMADB_URL;
export const CHROMA_COLLECTION = process.env.CHROMA_COLLECTION!;
export const LM_STUDIO_BASE_URL = process.env.LM_STUDIO_BASE_URL!;
export const CHAT_MODEL = process.env.CHAT_MODEL!;
export const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL!;
export const MAX_SEARCHES = parseInt(process.env.MAX_SEARCHES!, 10);
export const SEARXNG_URL = process.env.SEARXNG_URL!;
export const ORCHESTRATOR_USER_ID = process.env.ORCHESTRATOR_USER_ID!;
export const ORCHESTRATOR_TOKEN_ID = process.env.ORCHESTRATOR_TOKEN_ID!;

export const LMSTUDIO_API_KEY = process.env.LMSTUDIO_API_KEY;
