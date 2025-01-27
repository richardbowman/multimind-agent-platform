import { BackendServicesConfigNeeded } from "../types/BackendServices";
import { ClientMethods, ServerMethods } from "../shared/RPCInterface";
import Logger from "../helpers/logger";
import { LLMCallLogger } from "../llm/LLMLogger";
import { reinitializeBackend } from "../main.electron";
import { Settings } from "src/tools/settings";
import { LLMServiceFactory } from "src/llm/LLMServiceFactory";
import { ModelInfo } from "src/llm/types";
import { EmbedderModelInfo } from "src/llm/ILLMService";
import { UpdateStatus } from "src/shared/UpdateStatus";
import { AppUpdater } from "electron-updater";
import { ConfigurationError } from "src/errors/ConfigurationError";

export class LimitedRPCHandler implements Partial<ServerMethods> {
    protected clientRpc?: ClientMethods;

    constructor(private partialServices: BackendServicesConfigNeeded) {
    }

    createWrapper(): ServerMethods {
        const handler = this;
        return new Proxy({} as ServerMethods, {
            get(target, prop) {
                if (typeof handler[prop as keyof ServerMethods] === 'function') {
                    return async (...args: any[]) => {
                        try {
                            const result = await (handler[prop as keyof ServerMethods] as Function).apply(handler, args);
                            return result;
                        } catch (error) {
                            Logger.error(`Error in wrapped handler method ${String(prop)}:`, error);
                            throw error;
                        }
                    };
                }
                return undefined;
            }
        });
    }

    async openDevTools(): Promise<void> {
        if (process.env.NODE_ENV === 'development') {
            const mainWindow = this.partialServices.mainWindow.getWindow();
            mainWindow.webContents.openDevTools();
        }
    }


    async getSettings(): Promise<Settings> {
        const settings = this.partialServices.settingsManager.getSettings();

        // test getting defaults
        // const defaults = new Settings();
        // const clientSettings = getClientSettingsMetadata(defaults);

        return settings;
    }

    async getAvailableModels(provider: string): Promise<ModelInfo[]> {
        const service = LLMServiceFactory.createServiceByName(provider, this.partialServices.settingsManager.getSettings());
        return service.getAvailableModels();
    }

    async getAvailableEmbedders(provider: string): Promise<EmbedderModelInfo[]> {
        const service = LLMServiceFactory.createServiceByName(provider, this.partialServices.settingsManager.getSettings());
        return service.getAvailableEmbedders();
    }

    async updateSettings(settings: Partial<Settings>): Promise<{ settings: Settings, error?: string}> {
        Logger.info('Update settings called');
        
        this.partialServices.settingsManager.updateSettings(settings);

        // Reinitialize backend services
        let error;
        try {
            const backendServices = await reinitializeBackend();
            if (backendServices.error?.message) {
                error = backendServices.error.message;
            }
        } catch (caughtError) {
            Logger.error("Error updating settings", caughtError);
            error = (caughtError instanceof Error) ? caughtError.message : caughtError;
        }

        return { settings: this.partialServices.settingsManager.getSettings(), error };
    }

    setupClientEvents(rpc: ClientMethods, autoUpdater: AppUpdater) {
        this.clientRpc = rpc;
        
        // Set up auto-update event forwarding
        autoUpdater.on('checking-for-update', () => {
            Logger.info("Checking for updates...");
            rpc.onAutoUpdate({status: UpdateStatus.Checking});
        });

        autoUpdater.on('update-available', () => {
            Logger.info("Update available...");
            rpc.onAutoUpdate({status: UpdateStatus.Available});
        });

        autoUpdater.on('update-not-available', () => {
            Logger.info("Update not available.");
            rpc.onAutoUpdate({status: UpdateStatus.NotAvailable});
        });

        autoUpdater.on('download-progress', (progress) => {
            Logger.info("Downloading update...");
            rpc.onAutoUpdate({status: UpdateStatus.Downloading, progress: progress.percent/100});
        });

        autoUpdater.on('update-downloaded', () => {
            Logger.info("Download update complete...");
            rpc.onAutoUpdate({status: UpdateStatus.Downloaded});
        });
    }
    
    public setServices(services) {
        this.partialServices = services;
    }

    async getSystemLogs(params: {
        limit?: number;
        offset?: number;
        filter?: {
            level?: string[];
            search?: string;
            startTime?: number;
            endTime?: number;
        };
    }): Promise<{
        logs: LogEntry[];
        total: number;
    }> {
        return this.partialServices.logReader.getLogs(params || {});
    }

    async getLogs(logType: 'llm' | 'system' | 'api', params?: {
        limit?: number;
        offset?: number;
        filter?: {
            level?: string[];
            search?: string;
            startTime?: number;
            endTime?: number;
        };
    }): Promise<any> {
        switch (logType) {
            case 'llm':
                return await LLMCallLogger.getAllLogs();
            case 'system':
                return this.getSystemLogs(params || {});
            case 'api':
                return { logs: [], total: 0 }; // TODO: Implement API logs
            default:
                return { logs: [], total: 0 };
        }
    }

    async logClientEvent(level: string, message: string, details?: Record<string, any>): Promise<void> {
        try {
            // Log to both the main logger and LLM logger
            Logger.log(level, `[CLIENT] ${message}`, details);
        } catch (error) {
            Logger.error('Failed to process client log event:', error);
        }
    }

    async minimizeWindow(): Promise<void> {
        const mainWindow = this.partialServices.mainWindow.getWindow();
        mainWindow.minimize();
    }

    async maximizeWindow(): Promise<void> {
        const mainWindow = this.partialServices.mainWindow.getWindow();
        if (mainWindow.isMaximized()) {
            mainWindow.unmaximize();
        } else {
            mainWindow.maximize();
        }
    }

    async closeWindow(): Promise<void> {
        const mainWindow = this.partialServices.mainWindow.getWindow();
        mainWindow.close();
    }

    async getWindowState(): Promise<'maximized' | 'normal'> {
        const mainWindow = this.partialServices.mainWindow.getWindow();
        return mainWindow.isMaximized() ? 'maximized' : 'normal';
    }

    async quitAndInstall(): Promise<void> {
        this.partialServices.autoUpdater.quitAndInstall();
    }

}
