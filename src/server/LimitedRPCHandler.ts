import { BackendServicesConfigNeeded } from "../types/BackendServices";
import { ClientMethods, ServerMethods, UploadGGUFParameters } from "../shared/RPCInterface";
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
import { asError } from "src/types/types";
import { createWriteStream, WriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { getDataPath } from "src/helpers/paths";
import path from 'node:path';
import { LogEntry } from "./LogReader";

interface ClientError {
    message: string;
}

export class LimitedRPCHandler implements Partial<ServerMethods> {
    protected clientRpc?: ClientMethods;
    private uploadChunks = new Map<string, { filePath: string, writeStream: WriteStream }>();

    constructor(private partialServices: BackendServicesConfigNeeded) {
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

    async getAvailableModels(provider: string, search?: string): Promise<ModelInfo[]|ClientError> {
        try {
            const service = LLMServiceFactory.createService(this.partialServices.settingsManager.getSettings(), {provider});
            const models = await service.getAvailableModels({ textFilter: search });
            
            // Filter models if search term provided
            if (search && search.trim().length > 0) {
                const searchLower = search.toLowerCase();
                return models.filter(model => 
                    model.id.toLowerCase().includes(searchLower) ||
                    model.description?.toLowerCase().includes(searchLower) ||
                    model.provider?.toLowerCase().includes(searchLower)
                );
            }
            return models;
        } catch (e) {
            return {message: e.message}
        }
    }

    async getAvailableEmbedders(provider: string): Promise<EmbedderModelInfo[]|ClientError> {
        try {
            const service = LLMServiceFactory.createServiceByName(provider, this.partialServices.settingsManager.getSettings());
            return service.getAvailableEmbedders();
        } catch (e) {
            return { message: "Error getting available embedders: "+asError(e)?.message||"Unknown error getting available embedders" };
        }
    }

    async updateSettings(settings: Partial<Settings>): Promise<Settings|ClientError> {
        Logger.info('Update settings called');
        
        this.partialServices.settingsManager.updateSettings(settings);

        // Reinitialize backend services
        let error;
        try {
            const backendServices = await reinitializeBackend();
            if (backendServices.error?.message) {
                error = backendServices.error.message;
            }
            return this.partialServices.settingsManager.getSettings();
        } catch (caughtError) {
            Logger.error("Error updating settings", caughtError);
            error = (caughtError instanceof Error) ? caughtError.message : caughtError;
            return {
                message: error 
            };
        }
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


    async uploadGGUFModelChunk({ chunk, fileName, uploadId, isLast }: UploadGGUFParameters): Promise<{ uploadId: string, error?: string }> {
        try {
            // Validate file name on first chunk
            if (!uploadId && !fileName.endsWith('.gguf')) {
                return { uploadId: '', error: 'Only .gguf files are supported' };
            }

            // Get the models directory path
            const modelsDir = path.join(getDataPath(), 'models');
            await mkdir(modelsDir, { recursive: true });

            // Create a unique model ID based on filename
            const modelId = fileName.replace(/\.gguf$/i, '').toLowerCase().replace(/[^a-z0-9]/g, '-');
            const destPath = path.join(modelsDir, fileName);

            // Get or create write stream
            let writeStream: WriteStream;
            if (!uploadId) {
                writeStream = createWriteStream(destPath);
                this.uploadChunks.set(modelId, { filePath: destPath, writeStream });
                uploadId = modelId;
            } else {
                const upload = this.uploadChunks.get(uploadId);
                if (!upload) {
                    return { uploadId: '', error: 'Invalid upload session' };
                }
                writeStream = upload.writeStream;
            }

            // Decode base64 and write chunk
            const buffer = Buffer.from(chunk, 'base64');
            await new Promise<void>((resolve, reject) => {
                writeStream.write(buffer, (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            // Clean up if last chunk
            if (isLast) {
                await new Promise<void>((resolve, reject) => {
                    writeStream.end(() => {
                        this.uploadChunks.delete(uploadId);
                        resolve();
                    });
                });

                // TODO: Register the model with LlamaCPP
            }

            return { uploadId };
        } catch (error) {
            console.error('Failed to upload GGUF model:', error);
            return { 
                modelId: '', 
                error: error instanceof Error ? error.message : 'Failed to upload model' 
            };
        }
    }

}
