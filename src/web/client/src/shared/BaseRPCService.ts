import { createBirpc } from 'birpc';
import type { ServerMethods, ClientMethods } from './RPCInterface';
import type { ClientMessage, ClientChannel, ClientThread } from './IPCInterface';

export abstract class BaseRPCService {
    protected rpc!: ReturnType<typeof createBirpc<ServerMethods, ClientMethods>>;
    protected messageHandlers: ((messages: ClientMessage[], isLive: boolean) => void)[] = [];
    protected channelHandlers: ((channels: ClientChannel[]) => void)[] = [];
    protected threadHandlers: ((threads: ClientThread[]) => void)[] = [];
    protected taskHandlers: ((tasks: any[]) => void)[] = [];
    protected artifactHandlers: ((artifacts: any[]) => void)[] = [];
    protected handleHandlers: ((handles: Array<{ id: string; handle: string }>) => void)[] = [];
    protected logHandlers: ((logs: { type: string; data: any }) => void)[] = [];

    protected clientMethods: ClientMethods = {
        onMessage: (message) => {
            this.messageHandlers.forEach(handler => handler([message], true));
        },
        onChannels: (channels) => {
            this.channelHandlers.forEach(handler => handler(channels));
        },
        onThreads: (threads) => {
            this.threadHandlers.forEach(handler => handler(threads));
        },
        onTasks: (tasks) => {
            this.taskHandlers.forEach(handler => handler(tasks));
        },
        onArtifacts: (artifacts) => {
            this.artifactHandlers.forEach(handler => handler(artifacts));
        },
        onLogs: (logs) => {
            this.logHandlers.forEach(handler => handler(logs));
        },
        onHandles: (handles) => {
            this.handleHandlers.forEach(handler => handler(handles));
        },
        onSettingsUpdated: (settings) => {
            // Handle settings updates if needed
        }
    };

    // Event registration methods
    onMessage(handler: (messages: ClientMessage[], isLive: boolean) => void) {
        this.messageHandlers.push(handler);
        return () => {
            this.messageHandlers = this.messageHandlers.filter(h => h !== handler);
        };
    }

    onChannels(handler: (channels: ClientChannel[]) => void) {
        this.channelHandlers.push(handler);
        return () => {
            this.channelHandlers = this.channelHandlers.filter(h => h !== handler);
        };
    }

    onThreads(handler: (threads: ClientThread[]) => void) {
        this.threadHandlers.push(handler);
        return () => {
            this.threadHandlers = this.threadHandlers.filter(h => h !== handler);
        };
    }

    onTasks(handler: (tasks: any[]) => void) {
        this.taskHandlers.push(handler);
        return () => {
            this.taskHandlers = this.taskHandlers.filter(h => h !== handler);
        };
    }

    onArtifacts(handler: (artifacts: any[]) => void) {
        this.artifactHandlers.push(handler);
        return () => {
            this.artifactHandlers = this.artifactHandlers.filter(h => h !== handler);
        };
    }

    onLogs(handler: (logs: { type: string; data: any }) => void) {
        this.logHandlers.push(handler);
        return () => {
            this.logHandlers = this.logHandlers.filter(h => h !== handler);
        };
    }

    onHandles(handler: (handles: Array<{ id: string; handle: string }>) => void) {
        this.handleHandlers.push(handler);
        return () => {
            this.handleHandlers = this.handleHandlers.filter(h => h !== handler);
        };
    }


    // Implement IIPCService methods using birpc
    async sendMessage(message: Partial<ClientMessage>) {
        return this.rpc.sendMessage(message);
    }

    async getMessages(channelId: string, threadId: string | null, limit: number = 50) {
        return this.rpc.getMessages({ channelId, threadId, limit });
    }

    async getChannels() {
        const channels = await this.rpc.getChannels();
        this.channelHandlers.forEach(handler => handler(channels));
    }

    async getTasks(channelId: string, threadId: string | null) {
        return this.rpc.getTasks({ channelId, threadId });
    }

    async getArtifacts(channelId: string, threadId: string | null) {
        return this.rpc.getArtifacts({ channelId, threadId });
    }

    async getAllArtifacts() {
        return this.rpc.getAllArtifacts();
    }

    async deleteArtifact(artifactId: string) {
        return this.rpc.deleteArtifact(artifactId);
    }

    async getSettings() {
        return this.rpc.getSettings();
    }

    async updateSettings(settings: any) {
        return this.rpc.updateSettings(settings);
    }

    async getLogs(logType: 'llm' | 'system' | 'api') {
        return this.rpc.getLogs(logType);
    }

    async getHandles() {
        return this.rpc.getHandles();
    }

    // Abstract methods that must be implemented by WebSocket and IPC services
    abstract connect(): void;
    abstract disconnect(): void;
}
