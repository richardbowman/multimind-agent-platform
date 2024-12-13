export interface WebSocketMessage {
    type: 'CHAT' | 'CHANNEL' | 'THREAD' | 'TASK' | 'ARTIFACT';
    action: 'CREATE' | 'UPDATE' | 'DELETE' | 'LIST';
    payload: any;
}

export interface ChatMessage {
    id: string;
    channelId: string;
    userId: string;
    content: string;
    timestamp: number;
    threadId?: string;
}

export interface Channel {
    id: string;
    name: string;
}

export interface Thread {
    id: string;
    channelId: string;
    rootMessageId: string;
}
