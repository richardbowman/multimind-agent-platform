import Logger from "src/helpers/logger";
import { ChatClient, ChatPost, ConversationContext, ProjectChainResponse } from "./chatClient";
import * as fs from "fs/promises";

export class InMemoryPost implements ChatPost {
    static fromLoad(postData: any) : InMemoryPost {
        const post = new InMemoryPost(
            postData.channel_id,
            postData.message,
            postData.user_id,
            postData.props,
            postData.create_at
        );
        // override back to original ID
        post.id = postData.id;
        return post;
    }

    public id: string;
    public channel_id: string;
    public message: string;
    public user_id: string;
    public props: ConversationContext;
    public create_at: number;
    public directed_at: string;

    constructor(channel_id: string, message: string, user_id: string, props?: Record<string, any>, create_at?: number) {
        this.id = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        this.channel_id = channel_id;
        this.message = message;
        this.user_id = user_id;
        this.props = props || {};
        this.create_at = create_at || Date.now();
        this.directed_at = props?.directed_at;
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

export class LocalChatStorage {
    channelNames: Record<string, string> = {};
    posts: ChatPost[] = [];
    callbacks: Function[] = [];
    userIdToHandleName: Record<string, string> = {}; // New mapping for user IDs to handle names

    private storagePath: string;
    saveQueued: any;

    constructor(storagePath: string) {
        this.storagePath = storagePath;
    }

    public async addPost(post: ChatPost) : Promise<void> {
        if (!post.message) {
            try {
                throw new Error("Empty message.")
            } catch (e) {
                Logger.error("Add post failed", e);
            }
            return;
        }
        this.posts.push(post);
        await this.save();
        // Logger.info(JSON.stringify(this.posts, null, 2))
        this.callbacks.forEach(c => c(post));
    }

    public registerChannel(channelId: string, channelName: string) {
        this.channelNames[channelId] = channelName;
    }

    // New method to map user IDs to handle names
    public mapUserIdToHandleName(userId: string, handleName: string) {
        this.userIdToHandleName[userId] = handleName;
    }

    // Optional: Method to get the handle name for a given user ID
    public getHandleNameForUserId(userId: string): string | undefined {
        return this.userIdToHandleName[userId];
    }

    public async save(): Promise<void> {
        try {
            if (this.saveQueued) return;
            this.saveQueued = true;
            const updateTasks = () => {
                const data = {
                    channelNames: this.channelNames,
                    posts: this.posts,
                    userIdToHandleName: this.userIdToHandleName
                };
    
                return fs.writeFile(this.storagePath, JSON.stringify(data, null, 2), 'utf8');
            };
            await updateTasks();
        } catch (error) {
            Logger.error('Failed to save tasks:', error);
        } finally {
            this.saveQueued = false;
        }
    }

    public async load(): Promise<void> {
        try {
            const data = await fs.readFile(this.storagePath, 'utf8');
            const parsedData = JSON.parse(data);
            if (parsedData.channelNames) this.channelNames = parsedData.channelNames;
            if (parsedData.posts) this.posts = parsedData.posts.map(p => InMemoryPost.fromLoad(p));
            if (parsedData.userIdToHandleName) this.userIdToHandleName = parsedData.userIdToHandleName;
            Logger.info(`Loaded ${this.posts.length} chat posts from disk`);
        } catch (error: unknown) {
            // If the file doesn't exist or is invalid, initialize with default values
            if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
                Logger.info('No saved data found. Starting with a fresh storage.');
                return;
            }

            Logger.error('Error loading chat storage:', error);
        }
    }
}

export class LocalTestClient implements ChatClient {
    private webSocketUrl: string;
    private userId: string;
    private callback: (data: ChatPost) => void = () => {};
    storage: LocalChatStorage;

    constructor(userId: string, webSocketUrl: string, storage: LocalChatStorage) {
        this.userId = userId;
        this.webSocketUrl = webSocketUrl;
        this.storage = storage;
    }

    public registerHandle(handleName: string) {
        this.storage.mapUserIdToHandleName(this.userId, handleName);
    }

    public getChannels(): Promise<[string, string][]> {
        return Promise.resolve(
            Object.entries(this.storage.channelNames)
        );
    }

    public getPosts() {
        return this.storage.posts;
    }

    public fetchPreviousMessages(channelId: string, limit: number = 5): Promise<ChatPost[]> {
        return Promise.resolve(this.getPosts().filter(p => p.channel_id === channelId).slice(-limit));
    }

    getPost(id: string): Promise<ChatPost> {
        const post = this.storage.posts.find(p => p.id === id);
        if (!post) throw new Error(`Could not find post ${id}`);
        return Promise.resolve(post);
    }

    public postInChannel(channelId: string, message: string, props?: Record<string, any>): Promise<ChatPost> {
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

    public receiveMessages(callback: (data: ChatPost) => void): void {
        this.callback = callback;
        this.storage.callbacks.push(this.callback)
    }

    public closeCallback(): void {
        Logger.verbose('Simulated WebSocket connection closed');
    }

    public async getThreadChain(post: ChatPost): Promise<ChatPost[]> {
        const posts = await this.getPosts();
        const rootId = post.getRootId() || post.id;

        const rootPost = posts.find(p => p.id === rootId);
        if (!rootPost) throw new Error(`Thread chain not found for root post ID ${rootId}`);

        const threadPosts = posts.filter(p => p.getRootId() === rootId);
        return [rootPost, ...threadPosts];
    }

    public postReply(rootId: string, channelId: string, message: string, props?: Record<string, any>): Promise<ChatPost> {
        const replyProps = props||{};
        replyProps['root-id'] = rootId;
        
        const rootPost = this.getPosts().find(p => p.id === rootId);
        if (rootPost && !rootPost.getRootId()) {
            const replyPost = new InMemoryPost(
                channelId,
                message,
                this.userId,
                replyProps
            );
            this.pushPost(replyPost);
            return Promise.resolve(replyPost);
        } else {
            throw new Error("Coudln't find post or post wasn't a root post to reply to.")
        }
    }

    public replyThreaded(post: ChatPost, response: string, props?: Record<string, any>): Promise<ChatPost> {
        const rootId = post.getRootId()||post.id;
        const replyProps : Record<string, any>= props||{};
        replyProps['root-id'] = rootId;
        
        const rootPost = this.getPosts().find(p => p.id === rootId);
        if (rootPost && !rootPost.getRootId()) {
            const replyPost = new InMemoryPost(
                post.channel_id,
                response,
                this.userId,
                replyProps
            );
            this.pushPost(replyPost);
            return Promise.resolve(replyPost);
        } else {
            throw new Error("Coudln't find post or post wasn't a root post to reply to.")
        }    
    }

    private pushPost(post: ChatPost): void {
        this.storage.addPost(post);
    }
}
