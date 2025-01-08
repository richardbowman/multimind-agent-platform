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
            {},
            {
                post: (data) => (window as any).electron.send('birpc', data),
                on: (handler) => (window as any).electron.receive('birpc', handler),
                serialize: JSON.stringify,
                deserialize: JSON.parse,
            }
        );

    }

    connect(): void {
        // No-op for Electron
    }

    disconnect(): void {
        // No-op for Electron
    }
}
