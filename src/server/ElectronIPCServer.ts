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

    constructor(private services: BackendServices, private mainWindow: BrowserWindow) {
        this.handler = new MessageHandler(services);
        this.setupRPC();
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
        
        this.handler.setupClientEvents(rpc);
    }

    cleanup() {
        // Remove all IPC handlers
        if (this.rpc) this.rpc.$close();
    }
}
