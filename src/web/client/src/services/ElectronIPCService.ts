import { createBirpc } from 'birpc';
import { BaseRPCService } from '../shared/BaseRPCService';
import type { ClientMethods, ServerMethods } from '../shared/RPCInterface';
import { createSafeRPCHandlers } from '../shared/rpcUtils';

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
            {},
            {
                post: (data) => {
                    const serialized = safeHandlers.serialize(data);
                    return (window as any).electron.send('birpc', serialized);
                },
                on: (handler) => {
                    const safeHandler = safeHandlers.on((data) => {
                        const deserialized = safeHandlers.deserialize(data);
                        return handler(deserialized);
                    });
                    return (window as any).electron.receive('birpc', safeHandler);
                },
                serialize: safeHandlers.serialize,
                deserialize: safeHandlers.deserialize,
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
