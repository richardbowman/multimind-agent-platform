import { createBirpc } from 'birpc';
import { BaseRPCService } from '../shared/BaseRPCService';
import type { ClientMethods, ServerMethods } from '../shared/RPCInterface';
import { createSafeRPCHandlers } from '../shared/rpcUtils';
import { ClientMessage } from '../shared/IPCInterface';

export class ElectronIPCService extends BaseRPCService {
    constructor() {
        super();
        if (!(window as any).electron) {
            throw new Error('Electron IPC not available');
        }
        this.setupRPC();
    }

    private setupRPC() {
        // Initialize birpc
        const safeHandlers = createSafeRPCHandlers();
        this.rpc = createBirpc<ServerMethods, ClientMethods>(
            {
                onMessage: (messages: ClientMessage[]) => {
                    this.emit('onMessage', messages);
                },
                onLogUpdate: (update: { type: string; entry: any }) => {
                    this.emit('onLogUpdate', update);
                },
                onBackendStatus: (status: { configured: boolean; ready: boolean; message?: string }) => {
                    if (status.configured) {
                        this.emit('connected');
                    } else {
                        this.emit('needsConfig');
                    }
                }
            },
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
            }
        );
    }

    connect(): void {
        
    }

    disconnect(): void {
        // No-op for Electron
    }
}
