// config.ts
import Logger from './logger';
import * as path from 'path';
import { Settings, SettingsManager } from '../tools/settingsManager';

const settingsManager = new SettingsManager();

// Initialize settings
async function initializeConfig() {
  await settingsManager.load();
  Logger.info(`Loading config from ${settingsManager.getBaseDir()}`);
  
  const settings = settingsManager.getSettings();
  
  // Inject settings into process.env for backwards compatibility
  Object.entries(settings).forEach(([key, value]) => {
    const envKey = key.toUpperCase();
    if (typeof value === 'string' || typeof value === 'number') {
      process.env[envKey] = String(value);
    } else if (typeof value === 'object' && value !== null) {
      // Handle nested objects like agents
      Object.entries(value).forEach(([subKey, subValue]) => {
        if (typeof subValue === 'string' || typeof subValue === 'number') {
          process.env[`${envKey}_${subKey.toUpperCase()}`] = String(subValue);
        } else if (typeof subValue === 'object' && subValue !== null) {
          Object.entries(subValue).forEach(([lastKey, lastValue]) => {
            if (typeof lastValue === 'string' || typeof lastValue === 'number') {
              process.env[`${envKey}_${subKey.toUpperCase()}_${lastKey.toUpperCase()}`] = String(lastValue);
            }
          });
        }
      });
    }
  });
}

// Initialize configuration
await initializeConfig().catch(err => Logger.error('Error loading settings:', err));


// Channel and User IDs
export const WEB_RESEARCH_CHANNEL_ID = process.env.WEB_RESEARCH_CHANNEL_ID!;
export const RESEARCHER_TOKEN = process.env.RESEARCHER_TOKEN!;
export const RESEARCHER_USER_ID = process.env.RESEARCHER_USER_ID!;
export const PROJECTS_CHANNEL_ID = process.env.PROJECTS_CHANNEL_ID!;
export const CONTENT_CREATION_CHANNEL_ID = process.env.CONTENT_CREATION_CHANNEL_ID!;
export const CONTENT_MANAGER_USER_ID = process.env.CONTENT_MANAGER_USER_ID!;
export const CONTENT_WRITER_USER_ID = process.env.CONTENT_WRITER_USER_ID!;
export const ONBOARDING_CONSULTANT_USER_ID = process.env.ONBOARDING_CONSULTANT_USER_ID!;
export const ONBOARDING_CHANNEL_ID = process.env.ONBOARDING_CHANNEL_ID!;
export const PROJECT_MANAGER_USER_ID = process.env.PROJECT_MANAGER_USER_ID!;
export const FACT_CHECKER_USER_ID = process.env.FACT_CHECKER_USER_ID!;
export const FACT_CHECK_CHANNEL_ID = process.env.FACT_CHECK_CHANNEL_ID!;
export const SOLVER_AGENT_USER_ID = process.env.SOLVER_AGENT_USER_ID!;
export const SOLVER_AGENT_TOKEN = process.env.SOLVER_AGENT_TOKEN!;
export const SOLVER_CHANNEL_ID = process.env.SOLVER_CHANNEL_ID!;
export const RESEARCH_MANAGER_USER_ID = process.env.RESEARCH_MANAGER_USER_ID!;
export const RESEARCH_MANAGER_TOKEN_ID = process.env.RESEARCH_MANAGER_TOKEN_ID!;

// Server settings
export let HOST = process.env.HOST || 'localhost';
export let PORT = parseInt(process.env.PORT || '4001');
export let PROTOCOL = process.env.PROTOCOL || 'https';

// LLM Provider settings
export let LLM_PROVIDER = process.env.LLM_PROVIDER || 'lmstudio';
export let CHAT_MODEL = process.env.CHAT_MODEL || '';
export let LLM_WEAK_MODEL = process.env.LLM_WEAK_MODEL || '';
export let LLM_HEAVY_MODEL = process.env.LLM_HEAVY_MODEL || '';
export const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL!;
export const EMBEDDING_PROVIDER = process.env.EMBEDDING_PROVIDER || process.env.LLM_PROVIDER;
export const LM_STUDIO_BASE_URL = process.env.LM_STUDIO_BASE_URL!;

// API Keys
export let LMSTUDIO_API_KEY = process.env.LMSTUDIO_API_KEY || '';
export let ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
export const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-3-opus-20240229';

// Rate Limiting
export let ANTHROPIC_MAX_TOKENS_PER_MINUTE = parseInt(process.env.ANTHROPIC_MAX_TOKENS_PER_MINUTE || '50000');
export let ANTHROPIC_DEFAULT_DELAY_MS = parseInt(process.env.ANTHROPIC_DEFAULT_DELAY_MS || '1000');
export const ANTHROPIC_WINDOW_SIZE_MS = parseInt(process.env.ANTHROPIC_WINDOW_SIZE_MS || '60000');
export let BEDROCK_MAX_TOKENS_PER_MINUTE = parseInt(process.env.BEDROCK_MAX_TOKENS_PER_MINUTE || '50000');
export const BEDROCK_DEFAULT_DELAY_MS = parseInt(process.env.BEDROCK_DEFAULT_DELAY_MS || '1000');
export const BEDROCK_WINDOW_SIZE_MS = parseInt(process.env.BEDROCK_WINDOW_SIZE_MS || '60000');

// Vector DB Settings
export let VECTOR_DATABASE_TYPE = process.env.VECTOR_DATABASE_TYPE || 'vectra';
export let CHROMADB_URL = process.env.CHROMADB_URL || '';
export const CHROMA_COLLECTION = process.env.CHROMA_COLLECTION!;

// Search Settings
export const MAX_SEARCHES = parseInt(process.env.MAX_SEARCHES!, 10);
export const SEARXNG_URL = process.env.SEARXNG_URL!;

// Export settings object for UI consumption
export const getUISettings = () => settingsManager.getSettings();

// Update settings
export const setSettings = async (settings: Partial<Settings>) => {
    await settingsManager.updateSettings(settings);
};