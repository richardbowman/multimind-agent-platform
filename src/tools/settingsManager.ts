import * as fs from 'fs/promises';
import * as path from 'path';
import JSON5 from 'json5';
import { getDataPath } from '../helpers/paths';
import Logger from '../helpers/logger';
import { AsyncQueue } from '../helpers/asyncQueue';
import { EventEmitter } from 'events';
import { app } from 'electron';
import { Settings } from './settings';
import { isObject } from '../types/types';

export class SettingsManager extends EventEmitter {
    private settings?: Settings;
    private settingsFile: string;
    private fileQueue: AsyncQueue;
    private baseDir: string;

    constructor() {
        super();
        this.fileQueue = new AsyncQueue();
        this.baseDir = this.determineBaseDir();
        this.settingsFile = path.join(getDataPath(), 'settings.json5');
        console.log(`Settings will be written to ${this.settingsFile}`)
    }

    private determineBaseDir(): string {
        try {
            if (process.versions['electron']) {
                if (app) {
                    return path.join(app.getAppPath(), "dist");
                }
            } else {
                return path.join(__dirname, "../../.output")
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

    private async loadAgents(): Promise<any> {
        try {
            const defaultsPath = path.join(this.baseDir, 'agents.json5');
            const data = await this.fileQueue.enqueue(() =>
                fs.readFile(defaultsPath, 'utf-8')
            );
            return JSON5.parse(data);
        } catch (error) {
            Logger.error('Error loading defaults:', error);
            return {};
        }
    }

    async load(): Promise<void> {
        const agentsConfig = await this.loadAgents();
        
        try {
            const data = await this.fileQueue.enqueue(() =>
                fs.readFile(this.settingsFile, 'utf-8')
            );
            let userSettings = {};
            try {
                userSettings = JSON5.parse(data);
            } catch (err) {
            }
            this.settings = this.deepMerge(new Settings(), userSettings);
            this.settings = this.deepMerge(this.settings, agentsConfig);   // overwrite agents config with latest
        } catch (error: any) {
            if (error?.code === 'ENOENT') {
                this.settings = agentsConfig;
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
            fs.writeFile(this.settingsFile, JSON5.stringify(this.settings, null, 2))
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
