import { ipcMain, BrowserWindow, app } from 'electron';
import { createBirpc } from 'birpc';
import { BackendServicesConfigNeeded, BackendServicesWithWindows } from '../types/BackendServices';
import { ServerRPCHandler } from './ServerRPCHandler';
import { createSafeServerRPCHandlers } from './rpcUtils';
import { ClientMethods, ServerMethods } from '../shared/RPCInterface';
import { LimitedRPCHandler } from './LimitedRPCHandler';
import { AppUpdater } from 'electron-updater';
import Logger from 'src/helpers/logger';
import { getDataPath } from 'src/helpers/paths';
import path from 'node:path';

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

    createWrapper(): ServerMethods {
        const _this = this;
        return new Proxy({} as ServerMethods, {
            get(target, prop) {
                if (typeof _this.handler[prop as keyof ServerMethods] === 'function') {
                    return async (...args: any[]) => {
                        try {
                            const result = await (_this.handler[prop as keyof ServerMethods] as Function).apply(_this.handler, args);
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

    private setupRPC() {
        const safeHandlers = createSafeServerRPCHandlers();

        const cleanupFns : Function[] = [];

        const rpc = createBirpc<ClientMethods, ServerMethods>(
            this.createWrapper(),
            {
                ...safeHandlers,
                post: (data) => {
                    if (!this.mainWindow?.isDestroyed()) {
                        this.mainWindow.webContents.send('birpc', data);
                    }
                },
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
        this.handler = services.type === 'configNeeded' ? 
            new LimitedRPCHandler(services) : 
            new ServerRPCHandler(services);
        this.handler.setServices(services);
        
        const rpc = this.getRPC();
        if (this.handler instanceof ServerRPCHandler && rpc) {
            this.handler.setupClientEvents(rpc, autoUpdater);
            rpc.onBackendStatus({
                configured: true,
                ready: true,
                appPath: app.getAppPath(),
                modelsPath: path.join(getDataPath(), "models")
            });
        } else {
            Logger.error("RPC not ready for backend status");
        }
    }

    getRPC() {
        return this.rpc;
    }
}
