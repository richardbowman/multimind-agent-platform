import { createBirpc } from 'birpc';
import { BaseRPCService } from '../shared/BaseRPCService';
import type { ClientMethods, ServerMethods } from '../shared/RPCInterface';

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
        this.rpc = createBirpc<ServerMethods, ClientMethods>(
            this.clientMethods,
            {
                post: (data) => (window as any).electron.send('birpc', data),
                on: (handler) => (window as any).electron.receive('birpc', handler),
                serialize: JSON.stringify,
                deserialize: JSON.parse,
            }
        );

        // Set up event listeners for notifications
        (window as any).electron.receive('message', (messages: any[], isLive: boolean) => {
            this.messageHandlers.forEach(handler => handler(messages, isLive));
        });

        (window as any).electron.receive('channels', (channels: any[]) => {
            this.channelHandlers.forEach(handler => handler(channels));
        });

        (window as any).electron.receive('tasks', (tasks: any[]) => {
            this.taskHandlers.forEach(handler => handler(tasks));
        });

        (window as any).electron.receive('artifacts', (artifacts: any[]) => {
            this.artifactHandlers.forEach(handler => handler(artifacts));
        });

        (window as any).electron.receive('logs', (logs: any) => {
            this.logHandlers.forEach(handler => handler(logs));
        });

        (window as any).electron.receive('handles', (handles: any[]) => {
            this.handleHandlers.forEach(handler => handler(handles));
        });
    }

    connect(): void {
        // No-op for Electron
    }

    disconnect(): void {
        // No-op for Electron
    }
}
