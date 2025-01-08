import { createBirpc } from 'birpc';
import type { ServerMethods, ClientMethods } from './RPCInterface';
import type { ClientMessage, ClientChannel, ClientThread } from './IPCInterface';

export abstract class BaseRPCService {
    protected rpc!: ReturnType<typeof createBirpc<ServerMethods, ClientMethods>>;

    // Direct RPC method implementations
    // Direct pass-through to RPC methods
    sendMessage = (message: Partial<ClientMessage>) => this.rpc.sendMessage(message);
    getMessages = (channelId: string, threadId: string | null, limit: number = 50) => 
        this.rpc.getMessages({ channelId, threadId, limit });
    getChannels = () => this.rpc.getChannels();
    getTasks = (channelId: string, threadId: string | null) => 
        this.rpc.getTasks({ channelId, threadId });
    getArtifacts = (channelId: string, threadId: string | null) => 
        this.rpc.getArtifacts({ channelId, threadId });
    getAllArtifacts = () => this.rpc.getAllArtifacts();
    deleteArtifact = (artifactId: string) => this.rpc.deleteArtifact(artifactId);
    getSettings = () => this.rpc.getSettings();
    updateSettings = (settings: any) => this.rpc.updateSettings(settings);
    getLogs = (logType: 'llm' | 'system' | 'api') => this.rpc.getLogs(logType);
    getHandles = () => this.rpc.getHandles();

    // Abstract methods that must be implemented by WebSocket and IPC services
    abstract connect(): void;
    abstract disconnect(): void;
}
