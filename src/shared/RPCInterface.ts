import { ChannelData, CreateChannelHandlerParams } from 'src/shared/channelTypes';
import { ClientMessage, ClientProject } from "./types";
import { ClientThread } from "./types";
import { EmbedderModelInfo } from 'src/llm/ILLMService';
import { ModelInfo } from 'src/llm/types';
import { UpdateStatus } from './UpdateStatus';
import { UUID } from 'src/types/uuid';
import { Artifact, ArtifactItem } from 'src/tools/artifact';
import { GoalTemplate } from 'src/schemas/goalTemplateSchema';
import { Task } from 'src/tools/taskManager';
import { Settings } from 'src/tools/settings';
import { TaskEventType } from "src/shared/TaskEventType";
import { LLMLogEntry } from 'src/llm/LLMLogModel';
import { ModelType } from 'src/llm/types/ModelType';
import { LLMProvider } from 'src/llm/types/LLMProvider';

export interface LogEntry {
    timestamp: string;
    level: string;
    message: string;
    details?: Record<string, any>;
}

export class ClientError {
    readonly message: string;
    constructor(message: string) {
        this.message = message;
    };
}

export interface ServerMethods {
    sendMessage(message: Partial<ClientMessage>): Promise<ClientMessage>;
    getSystemLogs(params: {
        limit?: number;
        offset?: number;
        filter?: {
            level?: string[];
            search?: string;
            startTime?: number;
            endTime?: number;
            showVerbose?: boolean;
        };
    }): Promise<{
        logs: LogEntry[];
        total: number;
    }>;
    getLLMLogsPaginated({ offset, limit }: { offset: number; limit: number }): Promise<LLMLogEntry[]>;
    minimizeWindow(): Promise<void>;
    maximizeWindow(): Promise<void>;
    closeWindow(): Promise<void>;
    getWindowState(): Promise<'maximized' | 'normal' | 'fullscreen'>;
    toggleFullScreen(): Promise<void>;
    getMessages(params: { channelId: UUID; threadId?: UUID; limit?: number }): Promise<ClientMessage[]>;
    getChannels(): Promise<ChannelData[]>;
    getThreads(params: { channelId: string }): Promise<ClientThread[]>;
    getTasks(params: { channelId?: UUID; threadId?: UUID }): Promise<Task[]>;
    getTaskById(taskId: UUID): Promise<Readonly<Task>|null>;
    getArtifacts(params: { channelId: UUID; threadId?: UUID }): Promise<Artifact[]>;
    getArtifact(id: UUID): Promise<Artifact|undefined>;
    listArtifacts(): Promise<ArtifactItem[]>
    deleteArtifact(artifactId: string): Promise<any[]>;
    saveArtifact(artifact: Artifact): Promise<Artifact>;
    removeMessageAttachment(messageId: UUID, artifactId: UUID): Promise<void>;
    addArtifactToChannel(channelId: string, artifactId: string): Promise<void>;
    removeArtifactFromChannel(channelId: string, artifactId: string): Promise<void>;
    getSettings(): Promise<Settings>;
    updateSettings(settings: any): Promise<ClientError>;
    getLogs(logType: 'llm' | 'system' | 'api'): Promise<any>;
    getHandles(): Promise<Array<{id: string; handle: string}>>;
    quitAndInstall(): Promise<void>;

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
    createChannel(params: CreateChannelHandlerParams): Promise<string>;
    
    /**
     * Delete an existing channel
     * @param channelId - ID of the channel to delete
     * @returns Promise resolving when deletion is complete
     */
    deleteChannel(channelId: UUID): Promise<void>;

    getAvailableModels(provider: LLMProvider, modelType: ModelType, search?: string): Promise<ModelInfo[]|EmbedderModelInfo[]|ClientError>;
    rebuildVectorDB(): Promise<void>;
    getProject(projectId: string): Promise<ClientProject>;
    markTaskComplete(taskId: string, complete: boolean): Promise<Task>;
    cancelTask(taskId: string): Promise<Task>;
    
    loadGoalTemplates(): Promise<GoalTemplate[]>;

    /**
     * Open developer tools (only available in development mode)
     */
    openDevTools(): Promise<void>;

    /**
     * Transcribe audio and send as message
     * @param audioBuffer - Buffer containing audio data
     * @param channelId - Channel ID to send message to
     * @param threadId - Optional thread ID to reply to
     * @param language - Optional language code for transcription
     * @returns Promise resolving to the created message
     */
    transcribeAndSendAudio({
        audioBuffer, 
        channelId,
        threadId,
        language
    }: {
        audioBase64: string;
        channelId: UUID;
        threadId?: UUID;
        language?: string;
    }): Promise<ClientMessage>;

    /**
     * Get available executor types for agent configuration
     * @returns Promise resolving to array of executor type strings
     */
    getExecutorTypes(): Promise<string[]>;
    
    /**
     * Upload and register a GGUF model file
     * @param buffer - base64-encoded chunk
     * @returns Promise resolving to the model ID and any error
     */
    uploadGGUFModelChunk(params: UploadGGUFParameters): Promise<{ modelId: string, error?: string }>;

    resetSettings(): Promise<Settings>;

    /**
     * Delete a message and its replies if it's a root message
     * @param messageId - ID of the message to delete
     * @returns Promise resolving when deletion is complete
     */
    deleteMessage(messageId: UUID): Promise<void>;
}

export interface UploadGGUFParameters {
    chunk: string, // base64 encoded
    fileName: string, 
    uploadId: string, 
    isLast: boolean 
}


export interface BackendStatus {
    configured: boolean;
    ready: boolean;
    message?: string;
    appPath: string;
    modelsPath: string;
}

export interface LogParam {
    type: 'llm' | 'system' | 'api',
    entry: any;
}

export interface ClientMethods {
    onMessage(messages: ClientMessage[]): void;
    onLogUpdate(update: LogParam): void;
    onBackendStatus(status: BackendStatus): void;
    onTaskUpdate(task: Task, type: TaskEventType): void;
    onProjectUpdate(project: ClientProject): void;
    onFilesAttached(artifacts: Artifact[]): void;
    
    /**
     * Callback when a channel is created
     * @param channel - The newly created channel
     */
    onChannelCreated(channel: ChannelData): void;
    
    /**
     * Callback when a client log event is successfully processed
     * @param success - Whether the log was successfully recorded
     * @param message - Optional status message
     */
    onClientLogProcessed(success: boolean, message?: string): void;

    onAutoUpdate(update: { status: UpdateStatus, progress?: number}): void;
}
