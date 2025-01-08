import { ClientMessage, ClientChannel, ClientThread } from './IPCInterface';

export interface ServerMethods {
    sendMessage(message: Partial<ClientMessage>): Promise<ClientMessage>;
    getMessages(params: { channelId: string; threadId: string | null; limit?: number }): Promise<ClientMessage[]>;
    getChannels(): Promise<ClientChannel[]>;
    getThreads(params: { channelId: string }): Promise<ClientThread[]>;
    getTasks(params: { channelId: string; threadId: string | null }): Promise<any[]>;
    getArtifacts(params: { channelId: string; threadId: string | null }): Promise<any[]>;
    getAllArtifacts(): Promise<any[]>;
    deleteArtifact(artifactId: string): Promise<any[]>;
    getSettings(): Promise<any>;
    updateSettings(settings: any): Promise<any>;
    getLogs(logType: 'llm' | 'system' | 'api'): Promise<any>;
    getHandles(): Promise<Array<{id: string; handle: string}>>;
}

export interface ClientMethods {
    onMessage(message: ClientMessage): void;
    onChannels(channels: ClientChannel[]): void;
    onThreads(threads: ClientThread[]): void;
    onTasks(tasks: any[]): void;
    onArtifacts(artifacts: any[]): void;
    onLogs(logs: { type: string; data: any }): void;
    onHandles(handles: Array<{id: string; handle: string}>): void;
    onSettingsUpdated(settings: any): void;
}
