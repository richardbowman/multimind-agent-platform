import * as fs from 'fs/promises';
import * as path from 'path';
import { getDataPath } from '../helpers/paths';
import Logger from '../helpers/logger';
import { AsyncQueue } from '../helpers/asyncQueue';
import { EventEmitter } from 'events';
import { app } from 'electron';

export interface Settings {
    host: string;
    port: number;
    protocol: string;
    llmProvider: string;
    chatModel: string;
    llmWeakModel: string;
    llmHeavyModel: string;
    lmstudioApiKey: string;
    anthropicApiKey: string;
    anthropicMaxTokensPerMinute: number;
    anthropicDefaultDelayMs: number;
    bedrockMaxTokensPerMinute: number;
    vectorDatabaseType: string;
    chromadbUrl: string;
}

export class SettingsManager extends EventEmitter {
    private settings: Settings;
    private settingsFile: string;
    private fileQueue: AsyncQueue;
    private baseDir: string;

    constructor() {
        super();
        this.fileQueue = new AsyncQueue();
        this.baseDir = this.determineBaseDir();
        this.settingsFile = path.join(getDataPath(), 'settings.json');
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
            this.settings = { ...defaults, ...JSON.parse(data) };
        } catch (error) {
            if (error.code === 'ENOENT') {
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
        return { ...this.settings };
    }

    async updateSettings(newSettings: Partial<Settings>): Promise<void> {
        this.settings = { ...this.settings, ...newSettings };
        await this.save();
    }

    getBaseDir(): string {
        return this.baseDir;
    }
}
