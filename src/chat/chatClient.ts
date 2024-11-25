export interface ChatClient {
    fetchPreviousMessages(channelId: string, limit?: number): Promise<ChatPost[]>;
    findProjectChain(channelId: string, postRootId: string): Promise<ProjectChainResponse>;
    createPost(channelId: string, message: string, props?: Record<string, any>): Promise<ChatPost>;
    getWebSocketUrl(): string;
    initializeWebSocket(callback: (data: ChatPost) => void): void;
    closeWebSocket(): void;
    postReply(rootId: string, channelId: string, message: string): Promise<ChatPost>;
}

export interface ProjectChainResponse {
    activityType: any;
    posts : ChatPost[];
    projectId: string;
}

export interface ConversationContext extends Record<string, any> {
    "project-id"?: string;
    "conversation-root"?: string;
}

export interface ChatPost {
    id: string;
    channel_id: string;
    message: string;
    user_id: string;
    props: ConversationContext;
    create_at: number;
    
    getRootId(): string | null;
    isReply(): boolean;
    hasUUID(): boolean;
    getActivityType(): string | null;
}