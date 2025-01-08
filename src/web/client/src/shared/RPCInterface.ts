import { LLMLogEntry, LogParam } from '../../../../llm/LLMLogger';
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
    onMessage(messages: ClientMessage[]): void;
    onLogUpdate(update: LogParam): void;
}
