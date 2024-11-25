import Logger from "src/helpers/logger";
import { ChatClient, ChatPost, ProjectChainResponse } from "./chatClient";

export class InMemoryPost implements ChatPost {
    public id: string;
    public channel_id: string;
    public message: string;
    public user_id: string;
    public props: Record<string, any>;
    public create_at: number;

    constructor(channel_id: string, message: string, user_id: string, props?: Record<string, any>, create_at?: number) {
        this.id = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        this.channel_id = channel_id;
        this.message = message;
        this.user_id = user_id;
        this.props = props || {};
        this.create_at = create_at || Date.now();
    }

    public getRootId(): string | null {
        return this.props['root-id'] || null;
    }

    public isReply(): boolean {
        return !!this.props['root-id'];
    }

    public hasUUID(): boolean {
        const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
        return uuidPattern.test(this.message);
    }

    public getActivityType(): string | null {
        return this.props['activity-type'] || null;
    }
}

export class InMemoryChatStorage {
    posts: ChatPost[] = [];
    callbacks: Function[] = [];
    
    public addPost(post: ChatPost) {
        if (!post.message) {
            try {
                throw new Error("Empty message.")
            } catch (e) {
                Logger.error(e);
            }
            return;
        }
        this.posts.push(post);
        // Logger.info(JSON.stringify(this.posts, null, 2))
        this.callbacks.forEach(c => c(post));
    }
}

export class InMemoryTestClient implements ChatClient {
    private webSocketUrl: string;
    private userId: string;
    private callback: (data: ChatPost) => void;
    storage: InMemoryChatStorage;

    constructor(userId: string, webSocketUrl: string, storage: InMemoryChatStorage) {
        this.userId = userId;
        this.webSocketUrl = webSocketUrl;
        this.storage = storage;
    }

    public getPosts() {
        return this.storage.posts;
    }

    public fetchPreviousMessages(channelId: string, limit: number = 5): Promise<ChatPost[]> {
        return Promise.resolve(this.getPosts().filter(p => p.channel_id === channelId).slice(-limit));
    }

    public findProjectChain(channelId: string, postRootId: string): Promise<ProjectChainResponse> {
        Logger.info(`searching ${this.getPosts().length} posts for ${postRootId}`);
        
        const projectPost = this.getPosts().find(p => p.id === postRootId);
        if (!projectPost) {
            throw new Error("No root post found.");
        }

        return Promise.resolve({
            activityType: projectPost.getActivityType() || 'unknown',
            posts: this.getPosts().filter(p => p.getRootId() === projectPost.id),
            projectId: projectPost.props["project-id"]
        });
    }

    public createPost(channelId: string, message: string, props?: Record<string, any>): Promise<Post> {
        const post = new InMemoryPost(
            channelId,
            message,
            this.userId,
            props || {}
        );
        this.pushPost(post);
        return Promise.resolve(post);
    }

    public getWebSocketUrl(): string {
        return this.webSocketUrl;
    }

    public initializeWebSocket(callback: (data: ChatPost) => void): void {
        this.callback = callback;
        this.storage.callbacks.push(this.callback)

        // Simulate WebSocket connection
        Logger.info(`Simulating WebSocket connection to: ${this.getWebSocketUrl()}`);
    }

    public closeWebSocket(): void {
        Logger.info('Simulated WebSocket connection closed');
    }

    public postReply(rootId: string, channelId: string, message: string): Promise<ChatPost> {
        const replyPost = new InMemoryPost(
            channelId,
            message,
            this.userId,
            { 'root-id': rootId }
        );
        this.pushPost(replyPost);
        return Promise.resolve(replyPost);
    }

    public pushPost(post: ChatPost): void {
        this.storage.addPost(post);
    }
}