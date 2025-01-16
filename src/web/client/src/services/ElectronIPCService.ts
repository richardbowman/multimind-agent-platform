import { createBirpc } from 'birpc';
import { BaseRPCService } from '../../../../shared/BaseRPCService';
import type { ClientMethods, ServerMethods } from '../../../../shared/RPCInterface';
import { createSafeRPCHandlers } from '../../../../shared/rpcUtils';

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

            this.rpc = createBirpc<ServerMethods, ClientMethods>(
                {
                    onClientLogProcessed: (success, message) => 
                        this.wrapper.onClientLogProcessed.call(this, success, message),
                    onMessage: (messages) => 
                        this.wrapper.onMessage.call(this, messages),
                    onLogUpdate: (update) => 
                        this.wrapper.onLogUpdate.call(this, update),
                    onBackendStatus: (status) => 
                        this.wrapper.onBackendStatus.call(this, status),
                    onTaskUpdate: (task) => 
                        this.wrapper.onTaskUpdate.call(this, task),
                    onProjectUpdate: (project) => 
                        this.wrapper.onProjectUpdate.call(this, project),
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
