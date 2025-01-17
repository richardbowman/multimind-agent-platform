import { ipcMain, BrowserWindow } from 'electron';
import { createBirpc } from 'birpc';
import { BackendServices, BackendServicesConfigNeeded, BackendServicesWithWindows } from '../types/BackendServices';
import { ServerRPCHandler } from './RPCHandler';
import { createSafeServerRPCHandlers } from './rpcUtils';
import { ClientMethods, ServerMethods } from '../shared/RPCInterface';
import { LimitedRPCHandler } from './LimitedRPCHandler';
import { AppUpdater } from 'electron-updater';

export class ElectronIPCServer {
    private handler: LimitedRPCHandler|ServerRPCHandler;
    private rpc: ReturnType<typeof createBirpc<ClientMethods, ServerMethods>>|undefined;

    constructor(
        private services: BackendServicesConfigNeeded|BackendServicesWithWindows, 
        private mainWindow: BrowserWindow, 
        hasConfigError: boolean,
        private autoUpdater: typeof import('electron-updater').autoUpdater
    ) {
        if (services.type === "configNeeded") {
            this.handler = new LimitedRPCHandler(services);
        } else if (services.type === 'full') {
            this.handler = new ServerRPCHandler(services);
        } else {
            throw new Error("Cannot initialize, invalid handler type");
        }
        this.setupRPC();
        this.handler.setupClientEvents(this.getRPC()!, autoUpdater);
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

    async reinitialize(services: BackendServicesConfigNeeded|BackendServicesWithWindows, autoUpdater: AppUpdater) {
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
