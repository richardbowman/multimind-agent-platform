import { ipcMain, BrowserWindow } from 'electron';
import { createBirpc } from 'birpc';
import { BackendServices } from '../types/BackendServices';
import { MessageHandler } from './MessageHandler';
import { createSafeServerRPCHandlers } from './rpcUtils';
import { ClientMethods, ServerMethods } from '../web/client/src/shared/RPCInterface';
import { trackPromise } from '../helpers/errorHandler';
import Logger from '../helpers/logger';

export class ElectronIPCServer {
    private handler: MessageHandler;
    private rpc: ReturnType<typeof createBirpc<ClientMethods, ServerMethods>>|undefined;

    constructor(private services: BackendServices, private mainWindow: BrowserWindow, hasConfigError: boolean) {
        if (hasConfigError) {
            this.setupLimitedRpc();
        } else {
            this.setupRPC();
            this.handler = new MessageHandler(services);
            this.handler.setupClientEvents(rpc);
        }
    }

    private setupRPC() {
        const safeHandlers = createSafeServerRPCHandlers();

        const rpc = createBirpc<ClientMethods, ServerMethods>(
            this.handler.createWrapper(),
            {
                ...safeHandlers,
                post: (data) => this.mainWindow.webContents.send('birpc', data),
                on: (handler) => {
                    ipcMain.on('birpc', (_, data) => handler(data));
                    return () => ipcMain.removeListener('birpc', handler);
                }
            }
        );

        this.rpc = rpc;
    }

    private setupLimitedRpc() {
        const safeHandlers = createSafeServerRPCHandlers();

        const rpc = createBirpc<ClientMethods, ServerMethods>(
            {
                // Only expose settings-related methods
                getSettings: async () => {
                    return this.services.settings.getSettings();
                },
                updateSettings: async (settings: any) => {
                    return this.services.settings.updateSettings(settings);
                },
                // Stub out all other methods
                sendMessage: async () => { throw new Error('Configuration required') },
                getMessages: async () => { throw new Error('Configuration required') },
                getChannels: async () => { throw new Error('Configuration required') },
                getThreads: async () => { throw new Error('Configuration required') },
                getTasks: async () => { throw new Error('Configuration required') },
                getArtifacts: async () => { throw new Error('Configuration required') },
                getAllArtifacts: async () => { throw new Error('Configuration required') },
                deleteArtifact: async () => { throw new Error('Configuration required') },
                getHandles: async () => { throw new Error('Configuration required') },
                getLogs: async () => { throw new Error('Configuration required') }
            },
            {
                ...safeHandlers,
                post: (data) => this.mainWindow.webContents.send('birpc', data),
                on: (handler) => {
                    ipcMain.on('birpc', (_, data) => handler(data));
                    return () => ipcMain.removeListener('birpc', handler);
                }
            }
        );

        this.rpc = rpc;
    }


    cleanup() {
        // Remove all IPC handlers
        if (this.rpc) this.rpc.$close();
    }

    getRPC() {
        return this.rpc;
    }
}
