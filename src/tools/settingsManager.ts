import * as fs from 'fs/promises';
import * as path from 'path';

const isObject = (obj: any): boolean => {
    return obj && typeof obj === 'object' && !Array.isArray(obj);
};
import { getDataPath } from '../helpers/paths';
import Logger from '../helpers/logger';
import { AsyncQueue } from '../helpers/asyncQueue';
import { EventEmitter } from 'events';
import { app } from 'electron';

interface AgentDefinition {
    className: string;
    sourcePath: string;
    userId: string;
    handle?: string;
    description?: string;
    enabled: boolean;
    config?: Record<string, any>;
    autoRespondChannelIds?: String[];
}

export interface Settings {
    // Server settings
    host: string;
    port: number;
    protocol: string;
    wsUrl: string;

    // LLM Provider settings
    providers: {
        chat: string;
        embeddings: string;
    },
    models: {
        conversation: {
            lmstudio: string;
            anthropic: string;
            bedrock: string;
            openai: string;
            openrouter: string;
            llama_cpp: string;
        },
        reasoning: {
            lmstudio: string;
            anthropic: string;
            bedrock: string;
            openai: string;
            openrouter: string;
            llama_cpp: string;
        },
        document: {
            lmstudio: string;
            anthropic: string;
            bedrock: string;
            openai: string;
            openrouter: string;
            llama_cpp: string;
        }
    },
    embeddingModel: string;
    embeddingProvider: string;
    lmStudioBaseUrl: string;
    contextSize: number;

    // API Keys
    anthropic: {
        api: {
            key: string;
        },
        model: string;
    },
    openai: {
        api: {
            key: string;
        },
        model: string;
    },
    openrouter: {
        api: {
            key: string;
        },
        model: string;
    }

    // Rate Limiting
    anthropicMaxTokensPerMinute: number;
    anthropicDefaultDelayMs: number;
    anthropicWindowSizeMs: number;
    bedrockMaxTokensPerMinute: number;
    bedrockDefaultDelayMs: number;
    bedrockWindowSizeMs: number;

    // Vector DB Settings
    vectorDatabaseType: string;
    chromadbUrl: string;
    chromaCollection: string;

    // Search Settings
    searchProvider: 'duckduckgo' | 'searxng' | 'google' | 'brave';
    maxSearches: number;
    searxngUrl: string;
    maxFollows: number;
    maxResearchRequests: number;
    duckduckgo: {
        headless: boolean;
        timeout: number;
    };
    brave: {
        apiKey: string;
        endpoint: string;
    };

    // Channel configuration
    defaultChannels: Record<string, string>;
    
    // Agent configuration
    agents: {
        [key: string]: AgentDefinition 
    };

    // Bedrock specific settings
    bedrock: {
        maxTokensPerMinute: number;
        defaultDelayMs: number;
        windowSizeMs: number;
    };
}

export class SettingsManager extends EventEmitter {
    private settings?: Settings;
    private settingsFile: string;
    private fileQueue: AsyncQueue;
    private baseDir: string;

    constructor() {
        super();
        this.fileQueue = new AsyncQueue();
        this.baseDir = this.determineBaseDir();
        this.settingsFile = path.join(getDataPath(), 'settings.json');
        console.log(`Settings will be written to ${this.settingsFile}`)
    }

    private determineBaseDir(): string {
        try {
            if (process.versions['electron']) {
                if (app) {
                    const isDev = !app.isPackaged;
                    return isDev ? '.' : path.join(app.getAppPath(), "dist");
                }
            }
        } catch (error) {
            Logger.warn('Not running in Electron, using current directory for config');
        }
        return '.';
    }

    private deepMerge(target: any, source: any): any {
        const output = { ...target };
        if (isObject(target) && isObject(source)) {
            Object.keys(source).forEach(key => {
                if (isObject(source[key])) {
                    if (!(key in target)) {
                        Object.assign(output, { [key]: source[key] });
                    } else {
                        output[key] = this.deepMerge(target[key], source[key]);
                    }
                } else {
                    Object.assign(output, { [key]: source[key] });
                }
            });
        }
        return output;
    }

    private async loadDefaults(): Promise<any> {
        try {
            const defaultsPath = path.join(this.baseDir, 'defaults.json');
            const data = await this.fileQueue.enqueue(() =>
                fs.readFile(defaultsPath, 'utf-8')
            );
            return JSON.parse(data);
        } catch (error) {
            Logger.error('Error loading defaults:', error);
            return {};
        }
    }

    async load(): Promise<void> {
        const defaults = await this.loadDefaults();
        
        try {
            const data = await this.fileQueue.enqueue(() =>
                fs.readFile(this.settingsFile, 'utf-8')
            );
            let userSettings = {};
            try {
                userSettings = JSON.parse(data);
            } catch (err) {
            }
            this.settings = this.deepMerge(defaults, userSettings);
        } catch (error: any) {
            if (error?.code === 'ENOENT') {
                this.settings = defaults;
                await this.save();
            } else {
                Logger.error('Error loading settings:', error);
                throw error;
            }
        }
        
        this.emit('settingsLoaded', this.settings);
    }

    async save(): Promise<void> {
        await this.fileQueue.enqueue(() =>
            fs.writeFile(this.settingsFile, JSON.stringify(this.settings, null, 2))
        );
        this.emit('settingsUpdated', this.settings);
    }

    getSettings(): Settings {
        if (this.settings) {
            return { ...this.settings };
        } else {
            throw new Error("Settings not loaded");
        }
    }

    async updateSettings(newSettings: Partial<Settings>): Promise<Settings> {
        if (!this.settings) {
            throw new Error("Settings not loaded");
        }
        this.settings = { ...this.settings, ...newSettings };
        await this.save();
        return this.getSettings();
    }

    getBaseDir(): string {
        return this.baseDir;
    }
}
