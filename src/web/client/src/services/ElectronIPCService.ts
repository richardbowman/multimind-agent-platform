import { createBirpc } from 'birpc';
import { BaseRPCService } from '../../../../shared/BaseRPCService';
import type { ClientMethods, ServerMethods } from '../../../../shared/RPCInterface';
import { createSafeRPCHandlers } from '../../../../shared/rpcUtils';
import { ClientChannel } from '../../../../shared/types';
import { UpdateStatus } from '../../../../shared/UpdateStatus';

export class ElectronIPCService extends BaseRPCService {
    private status: { configured: boolean; ready: boolean; message?: string; };
    private connected: boolean;
    private wrapper: ClientMethods;

    constructor() {
        super();
        this.connected = false;
        if (!(window as any).electron) {
            throw new Error('Electron IPC not available');
        }
        
        // Bind methods to ensure proper this context
        this.setupRPC = this.setupRPC.bind(this);
        this.connect = this.connect.bind(this);
        this.disconnect = this.disconnect.bind(this);
    }

    private setupRPC(clientMethods: ClientMethods) {
        if (this.rpc) {
            this.wrapper = clientMethods;
        } else {
            // Initialize birpc
            const safeHandlers = createSafeRPCHandlers();

            const clientWrappers = new Proxy({} as ClientMethods, {
                get: (target, prop: string) => {
                    return (...args: any[]) => {
                        console.log(`[IPC] ${prop}`, args);
                        try {
                            if (this.wrapper && typeof this.wrapper[prop] === 'function') {
                                return this.wrapper[prop].call(this.wrapper, ...args);
                            }
                            throw new Error(`Method ${prop} not found on client wrapper`);
                        } catch (error) {
                            console.error(`[IPC] Error in ${prop}:`, error);
                            throw error;
                        }
                    };
                }
            });

            this.rpc = createBirpc<ServerMethods, ClientMethods>(
                clientWrappers,
                {
                    post: (data) => {
                        (window as any).electron.send('birpc', data);
                    },
                    on: (handler) => {
                        const cleanup = (window as any).electron.receive('birpc', handler);
                        return () => cleanup();
                    },
                    serialize: safeHandlers.serialize,
                    deserialize: safeHandlers.deserialize,
                    timeout: 180000
                }
            );
            this.on("onBackendStatus",  (status: { configured: boolean; ready: boolean; message?: string }) => {
                this.status = status;
                if (this.connected) {
                    this.fireStatus();
                }
            });

        }
    }

    fireStatus() {
        console.log('FIRE STATUS', this.status);
        if (this.status.configured) {
            this.emit('needsConfig', { needsConfig: false });
            this.emit('connected');
        } else {
            this.emit('needsConfig', { needsConfig: true });
        }
    }

    connect(): void {
        this.connected = true;
        if (this.status) {
            this.fireStatus();
        }

    }

    disconnect(): void {
        // No-op for Electron
    }
}
