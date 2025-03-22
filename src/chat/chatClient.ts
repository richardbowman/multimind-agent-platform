import { ChannelData, CreateChannelParams } from "src/shared/channelTypes";
import { ChatHandle } from "src/types/chatHandle";
import { UUID } from "src/types/uuid";

export interface ChatClient {
    onAddedToChannel(callback: (channelId: UUID, params: CreateChannelParams) => void): Promise<void>;
    
    /**
     * Update an existing post's content
     * @param postId - ID of the post to update
     * @param newContent - New content for the post
     * @param newProps - Optional new properties to update
     * @returns Promise resolving to the updated post
     */
    updatePost(postId: UUID, newContent: string|undefined, newProps?: ConversationContext): Promise<ChatPost>;

    getThreadChain(post: ChatPost): Promise<ChatPost[]>;
    getPost(confirmationPostId: UUID): Promise<ChatPost>;
    fetchPreviousMessages(channelId: UUID, limit?: number): Promise<ChatPost[]>;
    postInChannel(channelId: UUID, message: string, props?: Record<string, any>): Promise<ChatPost>;
    receiveMessages(callback: (data: ChatPost) => void): void;
    closeCallback(): void;
    /** 
     * deprecated Use replyThreaded instead
     */
    postReply(rootId: UUID, channelId: UUID, message: string, props?: Record<string, any>): Promise<ChatPost>;
    replyThreaded(post: ChatPost, response: string, props?: ConversationContext): Promise<ChatPost>;

    registerHandle(handleName: string): void;
    getChannels(): Promise<ChannelData[]>;
    getHandles(): Promise<Record<UUID, ChatHandle>>;
    
    /**
     * Get metadata about a specific channel
     * @param channelId - ID of the channel to get data for
     * @returns Promise resolving to channel metadata including projectId if exists
     */
    getChannelData(channelId: string): Promise<ChannelData>;
    
    /**
     * Create a new chat channel
     * @param name - Name of the channel to create
     * @param props - Optional properties including:
     *   - description: Channel description
     *   - isPrivate: Whether channel should be private
     *   - members: Array of user IDs to add to channel
     * @returns Promise resolving to the new channel ID
     */
    createChannel(params: CreateChannelParams): Promise<UUID>;

    /**
     * Delete an existing chat channel
     * @param channelId - ID of channel to delete
     * @returns Promise resolving when deletion is complete
     */
    deleteChannel(channelId: UUID): Promise<void>;
    
    /**
     * Add an artifact ID to a channel's linked artifacts
     * @param channelId - ID of the channel
     * @param artifactId - ID of the artifact to add
     */
    addArtifactToChannel(channelId: UUID, artifactId: UUID): Promise<void>;
    
    /**
     * Remove an artifact ID from a channel's linked artifacts
     * @param channelId - ID of the channel
     * @param artifactId - ID of the artifact to remove
     */
    removeArtifactFromChannel(channelId: UUID, artifactId: UUID): Promise<void>;
}

export interface ProjectChainResponse {
    activityType: any;
    posts : ChatPost[];
    projectId: UUID;
}

export interface ConversationContext extends Record<string, any> {
    "project-ids"?: string[];
    "conversation-root"?: string;
    artifactIds?: string[];
    partial?: boolean;
}

export interface Attachment {
    id: string;
    type: 'image' | 'file';
    url: string;
    name?: string;
    size?: number;
    width?: number;
    height?: number;
}

export interface CreateMessage {
    message: string;
    props?: ConversationContext;
    attachments?: Attachment[];
    files?: File[];
}

export interface Message extends CreateMessage  {
    id: UUID;
}

export interface ChatPost extends Message {
    id: UUID;
    channel_id: UUID;
    message: string;
    user_id: UUID;
    props: ConversationContext;
    create_at: number;
    update_at?: number;
    directed_at: string;
    thread_id?: UUID;
    attachments?: Attachment[];
    
    getRootId(): UUID | null;
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
           (post.directed_at === undefined || typeof post.directed_at === 'string') &&
           typeof post.props === 'object';
};

// Validate that userPost is a proper ChatPost
export const isValidPostParams = (post: any): post is Partial<ChatPost> => {
    return post && 
           typeof post.channel_id === 'string' &&
           typeof post.message === 'string' &&
           typeof post.user_id === 'string' &&
           typeof post.create_at === 'number' &&
           (post.directed_at === undefined || typeof post.directed_at === 'string') &&
           typeof post.props === 'object';
};
