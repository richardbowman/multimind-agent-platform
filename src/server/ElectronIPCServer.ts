import { ipcMain, BrowserWindow } from 'electron';
import { createBirpc } from 'birpc';
import { BackendServices } from '../types/BackendServices';
import { ServerRPCHandler } from './RPCHandler';
import { createSafeServerRPCHandlers } from './rpcUtils';
import { ClientMethods, ServerMethods } from '../shared/RPCInterface';

export class ElectronIPCServer {
    private handler: ServerRPCHandler;
    private rpc: ReturnType<typeof createBirpc<ClientMethods, ServerMethods>>|undefined;

    constructor(private services: BackendServices, private mainWindow: BrowserWindow, hasConfigError: boolean) {
        this.handler = new ServerRPCHandler(services);
        this.setupRPC();
        this.handler.setupClientEvents(this.getRPC()!);
    }

    private setupRPC() {
        const safeHandlers = createSafeServerRPCHandlers();

        const cleanupFns : Function[] = [];

        const rpc = createBirpc<ClientMethods, ServerMethods>(
            this.handler.createWrapper(),
            {
                ...safeHandlers,
                post: (data) => this.mainWindow.webContents.send('birpc', data),
                on: (handler) => {
                    ipcMain.on('birpc', (_, data) => handler(data));
                    const cleanup = () => {
                        console.log('listener removed');
                        ipcMain.removeListener('birpc', handler);
                    }
                    return cleanup;
                },
                timeout: 180000
            }
        );

        this.rpc = rpc;
    }

    cleanup() {
        console.log('cleaning up rpc');
        if (this.rpc) {
            this.rpc.$close();
            this.rpc = undefined;
        }
    }

    async reinitialize(services: BackendServices) {
        if (!this.getRPC()) {
            throw new Error("RPC has been terminated");
        }
        this.services = services;
        this.handler.setServices(services);
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
