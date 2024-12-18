// config.ts
import dotenv from 'dotenv';
import Logger from './logger';
import path from 'path';
import { app } from 'electron';

// Determine the base directory for config files
let baseDir = '.';
try {
    // Check if we're running in Electron
    if (process.versions['electron']) {
        const electron = require('electron');
        const app = electron.app || electron.remote?.app;
        
        if (app) {
            const isDev = !app.isPackaged;
            // When packaged, configs are in resources/app.asar
            baseDir = isDev ? '.' : path.join(process.resourcesPath, 'app.asar');
            Logger.info(`Running in Electron (${isDev ? 'dev' : 'prod'}), using base dir: ${baseDir}`);
        }
    }
} catch (error) {
    Logger.info('Not running in Electron, using current directory for config');
}

// Load environment variables from config files
dotenv.config({ path: path.join(baseDir, 'env.defaults') });
dotenv.config({ path: path.join(baseDir, '.env'), override: true });
dotenv.config({ path: path.join(baseDir, '.env.local'), override: true });

Logger.info(`Loading config from ${baseDir}`);
Logger.info(JSON.stringify(process.env, undefined, " "));

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
export const RESEARCH_MANAGER_USER_ID = process.env.RESEARCH_MANAGER_USER_ID!;
export const RESEARCH_MANAGER_TOKEN_ID = process.env.RESEARCH_MANAGER_TOKEN_ID!;

export const ONBOARDING_CONSULTANT_USER_ID = process.env.ONBOARDING_CONSULTANT_USER_ID!;
export const ONBOARDING_CHANNEL_ID = process.env.ONBOARDING_CHANNEL_ID!;

export const PROJECT_MANAGER_USER_ID = process.env.PROJECT_MANAGER_USER_ID!;

export const FACT_CHECKER_USER_ID = process.env.FACT_CHECKER_USER_ID!;
export const FACT_CHECK_CHANNEL_ID = process.env.FACT_CHECK_CHANNEL_ID!;

export const SOLVER_AGENT_USER_ID = process.env.SOLVER_AGENT_USER_ID!;
export const SOLVER_AGENT_TOKEN = process.env.SOLVER_AGENT_TOKEN!;
export const SOLVER_CHANNEL_ID = process.env.SOLVER_CHANNEL_ID!;

export const LMSTUDIO_API_KEY = process.env.LMSTUDIO_API_KEY;
export const LLM_PROVIDER = process.env.LLM_PROVIDER || 'lmstudio';
export const LLM_WEAK_MODEL = process.env.LLM_WEAK_MODEL;
export const LLM_HEAVY_MODEL = process.env.LLM_HEAVY_MODEL;
export const VECTOR_DATABASE_TYPE = process.env.VECTOR_DATABASE_TYPE || 'vectra';

// Bedrock rate limiting settings
export const BEDROCK_MAX_TOKENS_PER_MINUTE = parseInt(process.env.BEDROCK_MAX_TOKENS_PER_MINUTE || '50000');
export const BEDROCK_DEFAULT_DELAY_MS = parseInt(process.env.BEDROCK_DEFAULT_DELAY_MS || '1000');
export const BEDROCK_WINDOW_SIZE_MS = parseInt(process.env.BEDROCK_WINDOW_SIZE_MS || '60000');

// Anthropic settings
export const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;
export const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-3-opus-20240229';
export const ANTHROPIC_MAX_TOKENS_PER_MINUTE = parseInt(process.env.ANTHROPIC_MAX_TOKENS_PER_MINUTE || '50000');
export const ANTHROPIC_DEFAULT_DELAY_MS = parseInt(process.env.ANTHROPIC_DEFAULT_DELAY_MS || '1000');
export const ANTHROPIC_WINDOW_SIZE_MS = parseInt(process.env.ANTHROPIC_WINDOW_SIZE_MS || '60000');

export const HOST = parseInt(process.env.HOST || 'localhost');
export const PORT = parseInt(process.env.PORT || '3000');
export const PROTOCOL = parseInt(process.env.PROTOCOL || 'https');
