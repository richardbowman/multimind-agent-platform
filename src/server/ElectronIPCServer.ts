import { ipcMain, BrowserWindow } from 'electron';
import { BackendServices } from '../types/BackendServices';
import { MessageHandler } from './MessageHandler';
import { createSafeServerRPCHandlers } from './rpcUtils';

export class ElectronIPCServer {
    private handler: MessageHandler;

    constructor(private services: BackendServices, private mainWindow: BrowserWindow) {
        this.handler = new MessageHandler(services);
        this.setupIpcHandlers();
    }

    private setupIpcHandlers() {
        const safeHandlers = createSafeServerRPCHandlers();

        // Messages
        ipcMain.handle('send-message', async (_, message) => {
            try {
                const result = await this.handler.handleSendMessage(message);
                this.mainWindow.webContents.send('message', safeHandlers.serialize([result]), true);
                return result;
            } catch (error) {
                Logger.error('Error handling send-message:', error);
                throw error;
            }
        });

        ipcMain.handle('get-messages', async (_, params) => {
            return this.handler.handleGetMessages(params);
        });

        // Channels
        ipcMain.handle('get-channels', async () => {
            return this.handler.handleGetChannels();
        });

        // Tasks
        ipcMain.handle('get-tasks', async (_, params) => {
            return this.handler.handleGetTasks(params);
        });

        // Artifacts
        ipcMain.handle('get-artifacts', async (_, params) => {
            return this.handler.handleGetArtifacts(params);
        });

        ipcMain.handle('get-all-artifacts', async () => {
            return this.handler.handleGetAllArtifacts();
        });

        ipcMain.handle('delete-artifact', async (_, artifactId) => {
            const artifacts = await this.handler.handleDeleteArtifact(artifactId);
            this.mainWindow.webContents.send('artifacts', artifacts);
            return artifacts;
        });

        // Settings
        ipcMain.handle('get-settings', async () => {
            return this.handler.handleGetSettings();
        });

        ipcMain.handle('update-settings', async (_, settings) => {
            return this.handler.handleUpdateSettings(settings);
        });

        // Logs
        ipcMain.handle('get-logs', async (_, logType) => {
            return this.handler.handleGetLogs(logType);
        });

        // Handles
        ipcMain.handle('get-handles', async () => {
            return this.handler.handleGetHandles();
        });
    }

    cleanup() {
        // Remove all IPC handlers
        ipcMain.removeHandler('send-message');
        ipcMain.removeHandler('get-messages');
        ipcMain.removeHandler('get-channels');
        ipcMain.removeHandler('get-tasks');
        ipcMain.removeHandler('get-artifacts');
        ipcMain.removeHandler('get-all-artifacts');
        ipcMain.removeHandler('delete-artifact');
        ipcMain.removeHandler('get-settings');
        ipcMain.removeHandler('update-settings');
        ipcMain.removeHandler('get-logs');
        ipcMain.removeHandler('get-handles');
    }
}
