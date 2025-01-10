import { LLMLogEntry, LogParam } from '../../../../llm/LLMLogger';
import { ClientMessage, ClientChannel, ClientThread } from './IPCInterface';
import { ClientTask } from './types';

export interface ServerMethods {
    sendMessage(message: Partial<ClientMessage>): Promise<ClientMessage>;
    getMessages(params: { channelId: string; threadId: string | null; limit?: number }): Promise<ClientMessage[]>;
    getChannels(): Promise<ClientChannel[]>;
    getThreads(params: { channelId: string }): Promise<ClientThread[]>;
    getTasks(params: { channelId: string; threadId: string | null }): Promise<ClientTask[]>;
    getArtifacts(params: { channelId: string; threadId: string | null }): Promise<any[]>;
    getAllArtifacts(): Promise<any[]>;
    deleteArtifact(artifactId: string): Promise<any[]>;
    getSettings(): Promise<any>;
    updateSettings(settings: any): Promise<any>;
    getLogs(logType: 'llm' | 'system' | 'api'): Promise<any>;
    getHandles(): Promise<Array<{id: string; handle: string}>>;
    
    /**
     * Create a new channel
     * @param name - Name of the channel to create
     * @param description - Optional channel description
     * @param isPrivate - Whether the channel should be private
     * @returns Promise resolving to the new channel ID
     */
    createChannel(name: string, description?: string, isPrivate?: boolean): Promise<string>;
    
    /**
     * Delete an existing channel
     * @param channelId - ID of the channel to delete
     * @returns Promise resolving when deletion is complete
     */
    deleteChannel(channelId: string): Promise<void>;
}

export interface ClientMethods {
    onMessage(messages: ClientMessage[]): void;
    onLogUpdate(update: LogParam): void;
    onBackendStatus(status: { configured: boolean; ready: boolean; message?: string }): void;
}
