export interface ChatClient {
    getThreadChain(post: ChatPost): Promise<ChatPost[]>;
    getPost(confirmationPostId: string | undefined): ChatPost | PromiseLike<ChatPost>;
    fetchPreviousMessages(channelId: string, limit?: number): Promise<ChatPost[]>;
    findProjectChain(channelId: string, postRootId: string): Promise<ProjectChainResponse>;
    postInChannel(channelId: string, message: string, props?: Record<string, any>): Promise<ChatPost>;
    receiveMessages(callback: (data: ChatPost) => void): void;
    closeCallback(): void;
    /** 
     * deprecated Use replyThreaded instead
     */
    postReply(rootId: string, channelId: string, message: string, props?: Record<string, any>): Promise<ChatPost>;
    replyThreaded(post: ChatPost, response: string, props?: ConversationContext): Promise<ChatPost>;

    registerHandle(handleName: string): void;
}

export interface ProjectChainResponse {
    activityType: any;
    posts : ChatPost[];
    projectId: string;
}

export interface ConversationContext extends Record<string, any> {
    "project-id"?: string;
    "conversation-root"?: string;
    "artifact-ids"?: string[];
}

export interface Message {
    message: string;
    props?: ConversationContext;
}

export interface ChatPost extends Message {
    id: string;
    channel_id: string;
    message: string;
    user_id: string;
    props: ConversationContext;
    create_at: number;
    directed_at: string;
    
    getRootId(): string | null;
    isReply(): boolean;
    hasUUID(): boolean;
    getActivityType(): string | null;
}