import { createBirpc } from 'birpc';
import type { ServerMethods, ClientMethods } from './RPCInterface';
import type { ClientMessage, ClientChannel, ClientThread } from './IPCInterface';
import EventEmitter from 'events';
import { CreateChannelParams } from '../../../../shared/channelTypes';

export abstract class BaseRPCService extends EventEmitter {
    protected rpc!: ReturnType<typeof createBirpc<ServerMethods, ClientMethods>>;
    protected eventEmitter: EventEmitter = new EventEmitter();

    getRPC() {
        return this.rpc;
    }

    // Abstract methods that must be implemented by WebSocket and IPC services
    abstract connect(): void;
    abstract disconnect(): void;
}
