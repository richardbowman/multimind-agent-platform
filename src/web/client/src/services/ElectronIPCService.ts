import { createBirpc } from 'birpc';
import { BaseRPCService } from '../../../../shared/BaseRPCService';
import type { ClientMethods, ServerMethods } from '../../../../shared/RPCInterface';
import { createSafeRPCHandlers } from '../../../../shared/rpcUtils';
import { createClientMethods } from './ClientMethods';
import { DataContextMethods } from '../contexts/DataContext';

export class ElectronIPCService extends BaseRPCService {
    status: { configured: boolean; ready: boolean; message?: string; };
    connected: boolean;
    private contextMethods: DataContextMethods;

    constructor(contextMethods: DataContextMethods) {
        super();
        this.connected = false;
        this.contextMethods = contextMethods;
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
                ...createClientMethods(this.contextMethods, this.contextMethods.showSnackbar)
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
