
export const isObject = (obj: any): obj is Record<string, unknown> => {
    return obj && typeof obj === 'object' && !Array.isArray(obj);
};

export const isError = (obj: any): boolean => {
    return obj && typeof obj === 'object' && !Array.isArray(obj) && obj.message;
};
export const asError = (obj: any): { message: string, trace?: string, code?: string} => {
    return obj && typeof obj === 'object' && !Array.isArray(obj) && obj.message ? obj : {
        message: "Non-error object: " + JSON.stringify(obj, null, 2)
    };
};

export interface WebSocketMessage {
    type: 'CHAT' | 'CHANNEL' | 'THREAD' | 'TASK' | 'ARTIFACT' | 'LOG';
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
    goalTemplate?: string;
}

export interface Thread {
    id: string;
    channelId: string;
    rootMessageId: string;
}
