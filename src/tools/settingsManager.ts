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
        this.settings = this.getDefaultSettings();
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

    private getDefaultSettings(): Settings {
        return {
            host: 'localhost',
            port: 4001,
            protocol: 'https',
            llmProvider: 'lmstudio',
            chatModel: '',
            llmWeakModel: '',
            llmHeavyModel: '',
            lmstudioApiKey: '',
            anthropicApiKey: '',
            anthropicMaxTokensPerMinute: 50000,
            anthropicDefaultDelayMs: 1000,
            bedrockMaxTokensPerMinute: 50000,
            vectorDatabaseType: 'vectra',
            chromadbUrl: ''
        };
    }

    async load(): Promise<void> {
        try {
            const data = await this.fileQueue.enqueue(() =>
                fs.readFile(this.settingsFile, 'utf-8')
            );
            this.settings = { ...this.getDefaultSettings(), ...JSON.parse(data) };
            this.emit('settingsLoaded', this.settings);
        } catch (error) {
            if (error.code === 'ENOENT') {
                await this.save();
            } else {
                Logger.error('Error loading settings:', error);
                throw error;
            }
        }
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
