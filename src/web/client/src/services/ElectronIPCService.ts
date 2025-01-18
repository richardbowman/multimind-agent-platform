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

            const clientWrappers = {
                onClientLogProcessed: (success, message) => {
                    console.log('[IPC] onClientLogProcessed', { success, message });
                    try {
                        return this.wrapper.onClientLogProcessed.call(this, success, message);
                    } catch (error) {
                        console.error('[IPC] Error in onClientLogProcessed:', error);
                        throw error;
                    }
                },
                onMessage: (messages) => {
                    console.log('[IPC] onMessage', { messageCount: messages.length });
                    try {
                        return this.wrapper.onMessage.call(this, messages);
                    } catch (error) {
                        console.error('[IPC] Error in onMessage:', error);
                        throw error;
                    }
                },
                onLogUpdate: (update) => {
                    console.log('[IPC] onLogUpdate', { type: update.type });
                    try {
                        return this.wrapper.onLogUpdate.call(this, update);
                    } catch (error) {
                        console.error('[IPC] Error in onLogUpdate:', error);
                        throw error;
                    }
                },
                onBackendStatus: (status) => {
                    console.log('[IPC] onBackendStatus', status);
                    try {
                        return this.wrapper.onBackendStatus.call(this, status);
                    } catch (error) {
                        console.error('[IPC] Error in onBackendStatus:', error);
                        throw error;
                    }
                },
                onTaskUpdate: (task) => {
                    console.log('[IPC] onTaskUpdate', { taskId: task.id });
                    try {
                        return this.wrapper.onTaskUpdate.call(this, task);
                    } catch (error) {
                        console.error('[IPC] Error in onTaskUpdate:', error);
                        throw error;
                    }
                },
                onProjectUpdate: (project) => {
                    console.log('[IPC] onProjectUpdate', { projectId: project.id });
                    try {
                        return this.wrapper.onProjectUpdate.call(this, project);
                    } catch (error) {
                        console.error('[IPC] Error in onProjectUpdate:', error);
                        throw error;
                    }
                },
                onAutoUpdate: (update: { status: UpdateStatus, progress?: number}) => {
                    console.log('[IPC] onAutoUpdate');
                    try {
                        return this.wrapper.onAutoUpdate.call(this, update);
                    } catch (error) {
                        console.error('[IPC] Error in onAutoUpdate:', error);
                        throw error;
                    }
                },
                onChannelCreated: (channel: ClientChannel) => {
                    console.log('[IPC] onChannelCreated');
                    try {
                        return this.wrapper.onChannelCreated.call(this, channel);
                    } catch (error) {
                        console.error('[IPC] Error in onChannelCreated:', error);
                        throw error;
                    }
                }
            };

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
