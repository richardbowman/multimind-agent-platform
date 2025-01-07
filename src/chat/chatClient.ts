export interface ChatClient {
    getThreadChain(post: ChatPost): Promise<ChatPost[]>;
    getPost(confirmationPostId: string): Promise<ChatPost>;
    fetchPreviousMessages(channelId: string, limit?: number): Promise<ChatPost[]>;
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
    thread_id?: string;
    
    getRootId(): string | null;
    isReply(): boolean;
    hasUUID(): boolean;
    getActivityType(): string | null;
}

// Validate that userPost is a proper ChatPost
export const isValidChatPost = (post: any): post is ChatPost => {
    return post && 
           typeof post.id === 'string' &&
           typeof post.channel_id === 'string' &&
           typeof post.message === 'string' &&
           typeof post.user_id === 'string' &&
           typeof post.create_at === 'number' &&
           typeof post.directed_at === 'string' &&
           typeof post.props === 'object';
};
