import { ipcMain, BrowserWindow } from 'electron';
import { createBirpc } from 'birpc';
import { BackendServices } from '../types/BackendServices';
import { MessageHandler } from './MessageHandler';
import { createSafeServerRPCHandlers } from './rpcUtils';
import { ClientMethods, ServerMethods } from '../web/client/src/shared/RPCInterface';
import { trackPromise } from '../helpers/errorHandler';
import Logger from '../helpers/logger';
import { getUISettings } from '../helpers/config';
import { StartupHandler } from './StartupHandler';

export class ElectronIPCServer {
    private handler: StartupHandler|MessageHandler;
    private rpc: ReturnType<typeof createBirpc<ClientMethods, ServerMethods>>|undefined;

    constructor(private services: BackendServices, private mainWindow: BrowserWindow, hasConfigError: boolean) {
        if (hasConfigError) {
            this.handler = new StartupHandler();
            this.handler.setServicesReinitializedHandler(async (services) => {
                await this.reinitialize(services);
            });
            this.setupRPC();
        } else {
            this.handler = new MessageHandler(services);
            this.setupRPC();
            this.handler.setupClientEvents(this.getRPC());
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

    cleanup() {
        // Remove all IPC handlers
        if (this.rpc) {
            this.rpc.$close();
            this.rpc = undefined;
        }
        if (this.handler instanceof MessageHandler) {
            this.handler.cleanup?.();
        }
    }

    async reinitialize(services: BackendServices) {
        this.cleanup();
        this.services = services;
        this.handler = new MessageHandler(services);
        this.setupRPC();
        this.handler.setupClientEvents(this.getRPC());
        
        if (this.rpc) {
            this.rpc.onBackendStatus({
                configured: true,
                ready: true
            });
        }
    }

    getRPC() {
        return this.rpc;
    }
}
