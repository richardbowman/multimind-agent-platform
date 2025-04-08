import { createBirpc } from 'birpc';
import type { ServerMethods, ClientMethods } from './RPCInterface';
import EventEmitter from 'event-emitter';

export abstract class BaseRPCService {
    protected rpc!: ReturnType<typeof createBirpc<ServerMethods, ClientMethods>>;
    protected eventEmitter: EventEmitter = new EventEmitter();

    getRPC() {
        return this.rpc;
    }

    on(event, handler) {
        this.eventEmitter.on(event, handler);
    }

    emit(event, data) {
        this.eventEmitter.emit(event, data);
    }

    // Abstract methods that must be implemented by WebSocket and IPC services
    abstract connect(): void;
    abstract disconnect(): void;
}
