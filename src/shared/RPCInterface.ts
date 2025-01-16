import { CreateChannelParams } from 'src/shared/channelTypes';
import { LogParam } from '../llm/LLMLogger';
import { ClientMessage, ClientProject } from "./types";
import { ClientChannel } from "./types";
import { ClientThread } from "./types";
import { ClientTask } from './types';
import { EmbedderModelInfo } from 'src/llm/ILLMService';
import { ModelInfo } from 'src/llm/types';

export interface ServerMethods {
    sendMessage(message: Partial<ClientMessage>): Promise<ClientMessage>;
    minimizeWindow(): Promise<void>;
    maximizeWindow(): Promise<void>;
    closeWindow(): Promise<void>;
    getWindowState(): Promise<'maximized' | 'normal'>;
    getMessages(params: { channelId: string; threadId: string | null; limit?: number }): Promise<ClientMessage[]>;
    getChannels(): Promise<ClientChannel[]>;
    getThreads(params: { channelId: string }): Promise<ClientThread[]>;
    getTasks(params: { channelId: string; threadId: string | null }): Promise<ClientTask[]>;
    getArtifacts(params: { channelId: string; threadId: string | null }): Promise<any[]>;
    getAllArtifacts(): Promise<any[]>;
    deleteArtifact(artifactId: string): Promise<any[]>;
    addArtifactToChannel(channelId: string, artifactId: string): Promise<void>;
    removeArtifactFromChannel(channelId: string, artifactId: string): Promise<void>;
    getSettings(): Promise<any>;
    updateSettings(settings: any): Promise<any>;
    getLogs(logType: 'llm' | 'system' | 'api'): Promise<any>;
    getHandles(): Promise<Array<{id: string; handle: string}>>;

    /**
     * Log a client-side error or event
     * @param level - Log level (error, warn, info, debug)
     * @param message - The log message
     * @param details - Additional metadata about the error/event
     */
    logClientEvent(level: string, message: string, details?: Record<string, any>): Promise<void>;
    
    /**
     * Create a new channel
     * @param name - Name of the channel to create
     * @param description - Optional channel description
     * @param isPrivate - Whether the channel should be private
     * @returns Promise resolving to the new channel ID
     */
    createChannel(params: CreateChannelParams): Promise<string>;
    
    /**
     * Delete an existing channel
     * @param channelId - ID of the channel to delete
     * @returns Promise resolving when deletion is complete
     */
    deleteChannel(channelId: string): Promise<void>;

    getAvailableModels(provider: string): Promise<ModelInfo[]>;
    getAvailableEmbedders(provider: string): Promise<EmbedderModelInfo[]>;
    rebuildVectorDB(): Promise<void>;
    getProject(projectId: string): Promise<ClientProject>;
    markTaskComplete(taskId: string, complete: boolean): Promise<ClientTask>;
}

export interface ClientMethods {
    onMessage(messages: ClientMessage[]): void;
    onLogUpdate(update: LogParam): void;
    onBackendStatus(status: { configured: boolean; ready: boolean; message?: string }): void;
    onTaskUpdate(task: ClientTask): void;
    onProjectUpdate(project: ClientProject): void;
    
    /**
     * Callback when a client log event is successfully processed
     * @param success - Whether the log was successfully recorded
     * @param message - Optional status message
     */
    onClientLogProcessed(success: boolean, message?: string): void;
}
