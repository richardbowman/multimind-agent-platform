// config.ts
import Logger from './logger';
import * as path from 'path';
import { Settings, SettingsManager } from '../tools/settingsManager';
import * as dotenv from 'dotenv';


// Initialize settings
export async function initializeConfig() {
    const settingsManager = new SettingsManager();

    // Load .env first so environment variables take precedence
    const envResult = dotenv.config();
    // Load environment variables from config files
    dotenv.config({ path: path.join(settingsManager.getBaseDir(), 'env.defaults') });
    dotenv.config({ path: path.join(settingsManager.getBaseDir(), '.env') });
    dotenv.config({ path: path.join(settingsManager.getBaseDir(), '.env.local'), override: true });
    dotenv.config({ path: path.join(settingsManager.getBaseDir(), `.env.${process.env.NODE_ENV}`), override: true });

    if (envResult.error) {
        Logger.warn('No .env file found, using defaults only');
    }
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

    return settingsManager;
}