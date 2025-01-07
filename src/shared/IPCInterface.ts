import { ChatPost } from "../chat/chatClient";
import { LLMLogEntry } from "../llm/LLMLogger";

export interface ClientMessage {
    id: string;
    channel_id: string;
    thread_id?: string;
    message: string;
    user_id: string;
    create_at: number;
    directed_at?: string;
    props?: Record<string, any>;
    inProgress?: boolean;
    reply_count: number;
    
    getRootId(): string | null;
    isReply(): boolean;
    hasUUID(): boolean;
    getActivityType(): string | null;
}

export interface ClientChannel {
    id: string;
    name: string;
    description?: string;
}

export interface ClientThread {
    rootMessage: ClientMessage;
    replies: ClientMessage[];
    last_message_at: number;
    channel_id: string;
}

export interface IPCHandlers {
    sendMessage: (message: Partial<ClientMessage>) => Promise<void>;
    getMessages: (channelId: string, threadId: string | null) => Promise<ClientMessage[]>;
    getChannels: () => Promise<ClientChannel[]>;
    getTasks: (channelId: string, threadId: string | null) => Promise<any[]>;
    getArtifacts: (channelId: string, threadId: string | null) => Promise<any[]>;
    getAllArtifacts: () => Promise<any[]>;
    deleteArtifact: (artifactId: string) => Promise<void>;
    getSettings: () => Promise<any>;
    updateSettings: (settings: any) => Promise<void>;
    getLogs: (logType: 'llm' | 'system' | 'api') => Promise<any>;
    getHandles: () => Promise<Array<{id: string, handle: string}>>;
}

export interface IPCEvents {
    onMessage: (callback: (messages: ClientMessage[], isLive: boolean) => void) => () => void;
    onChannels: (callback: (channels: ClientChannel[]) => void) => () => void;
    onTasks: (callback: (tasks: any[]) => void) => () => void;
    onArtifacts: (callback: (artifacts: any[]) => void) => () => void;
    onLogs: (callback: (logs: { type: string, data: any }) => void) => () => void;
    onHandles: (callback: (handles: Array<{id: string, handle: string}>) => void) => () => void;
}

export interface IIPCService extends IPCHandlers, IPCEvents {
    connect(): void;
    disconnect(): void;
}
