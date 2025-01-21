import Logger from "../helpers/logger";
import { ChatClient, ChatPost, ConversationContext, ProjectChainResponse } from "../chat/chatClient";
import * as fs from "fs/promises";
import { AsyncQueue } from "../helpers/asyncQueue";
import { ChannelData, CreateChannelParams } from "src/shared/channelTypes";
import { EventEmitter } from "stream";
import { _getPathRecursive } from "@langchain/core/dist/utils/fast-json-patch/src/helpers";
import { createUUID, UUID } from "src/types/uuid";
import { ChatHandle } from "src/types/chatHandle";

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
        post.attachments = postData.attachments || [];
        return post;
    }

    public id: string;
    public channel_id: string;
    public message: string;
    public user_id: string;
    public props: ConversationContext;
    public create_at: number;
    public directed_at: string;
    public attachments?: Attachment[];

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

export class LocalChatStorage extends EventEmitter {
    
    channelNames: Record<string, string> = {};
    channelData: Record<string, ChannelData> = {};
    posts: ChatPost[] = [];
    callbacks: Function[] = [];
    userIdToHandleName: Record<string, string> = {}; // New mapping for user IDs to handle names

    private storagePath: string;
    private queue: AsyncQueue;

    constructor(storagePath: string) {
        super();
        this.storagePath = storagePath;
        this.queue = new AsyncQueue();
        this.setMaxListeners(100);
    }

    async createChannel(params: CreateChannelParams): Promise<UUID> {
        const channelId = createUUID();
        this.registerChannel(channelId, params.name);
        this.channelData[channelId] = {
            id: channelId,
            name: params.name,
            description: params.description,
            isPrivate: params.isPrivate,
            members: params.members,
            defaultResponderId: params.defaultResponderId,
            projectId: params.projectId,
            artifactIds: params.artifactIds
        };

        await this.save();

        this.emit("addChannel", channelId, params);
        return channelId;
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
        // if (!this.userIdToHandleName[userId]) {
            this.userIdToHandleName[userId] = handleName;
        // } else {
        //     throw new Error(`Duplicate handle registration ${handleName}`);
        // }
    }

    // Optional: Method to get the handle name for a given user ID
    public getHandleNameForUserId(userId: string): string | undefined {
        return this.userIdToHandleName[userId];
    }

    public async save(): Promise<void> {
        return this.queue.enqueue(async () => {
            await this._save();
        });
    }

    private async _save(): Promise<void> {
        try {
            const data = {
                channelNames: this.channelNames,
                channelData: this.channelData,
                posts: this.posts,
                userIdToHandleName: this.userIdToHandleName
            };
            await fs.writeFile(this.storagePath, JSON.stringify(data, null, 2), 'utf8');
        } catch (error) {
            Logger.error('Failed to save tasks:', error);
            throw error;
        }
    }

    public async load(): Promise<void> {
        return this.queue.enqueue(async () => {
            try {
                const data = await fs.readFile(this.storagePath, 'utf8');
                
                // Validate JSON structure before parsing
                if (!data.trim()) {
                    throw new Error('Empty file');
                }

                const parsedData = JSON.parse(data);
                
                // Validate basic structure
                if (typeof parsedData !== 'object' || parsedData === null) {
                    throw new Error('Invalid data format');
                }

                // Validate and load each component
                if (parsedData.channelNames && typeof parsedData.channelNames === 'object') {
                    this.channelNames = parsedData.channelNames;
                }
                
                if (parsedData.channelData && typeof parsedData.channelData === 'object') {
                    this.channelData = parsedData.channelData;
                }
                
                if (Array.isArray(parsedData.posts)) {
                    this.posts = parsedData.posts.map((p: any) => {
                        try {
                            return InMemoryPost.fromLoad(p);
                        } catch (e) {
                            Logger.warn('Failed to load post, skipping:', p);
                            return null;
                        }
                    }).filter(Boolean);
                }
                
                if (parsedData.userIdToHandleName && typeof parsedData.userIdToHandleName === 'object') {
                    this.userIdToHandleName = parsedData.userIdToHandleName;
                }

                Logger.info(`Loaded ${this.posts.length} chat posts from disk`);
            } catch (error: unknown) {
                // If the file doesn't exist or is invalid, initialize with default values
                if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
                    Logger.info('No saved data found. Starting with a fresh storage.');
                } else {
                    Logger.error('Error loading chat storage, starting fresh:', error);
                    // Backup corrupted file for debugging
                    try {
                        const backupPath = `${this.storagePath}.corrupted.${Date.now()}`;
                        await fs.rename(this.storagePath, backupPath);
                        Logger.info(`Backed up corrupted file to: ${backupPath}`);
                    } catch (backupError) {
                        Logger.error('Failed to backup corrupted file:', backupError);
                    }
                }
                
                // Initialize fresh storage
                this.channelNames = {};
                this.channelData = {};
                this.posts = [];
                this.userIdToHandleName = {};
                await this._save();
            }
        });
    }

    public announceChannels() {
        Object.keys(this.channelData).forEach(channelId => {
            const data = this.channelData[channelId];
            this.emit("addChannel", channelId, {
                name: this.channelNames[channelId],
                description: data.description,
                members: data.members,
                defaultResponderId: data.defaultResponderId,
                projectId: data.projectId
            } as CreateChannelParams);
        });
    }
}

export class LocalTestClient implements ChatClient {
    private webSocketUrl: string;
    private userId: UUID;
    private callback: (data: ChatPost) => void = () => {};
    storage: LocalChatStorage;

    constructor(userId: UUID, webSocketUrl: string, storage: LocalChatStorage) {
        this.userId = userId;
        this.webSocketUrl = webSocketUrl;
        this.storage = storage;
    }

    public registerHandle(handleName: string) {
        this.storage.mapUserIdToHandleName(this.userId, handleName);
    }

    public getChannels(): Promise<ChannelData[]> {
        return Promise.resolve(
            Object.entries(this.storage.channelNames).map(([id, name]) => {
                const channelData = this.storage.channelData[id];
                return {
                    id,
                    name,
                    description: channelData.description,
                    members: channelData?.members,
                    defaultResponderId: channelData?.defaultResponderId,
                    projectId: channelData?.projectId
                };
            })
        );
    }

    public getHandles(): Promise<Record<UUID, ChatHandle>> {
        return Promise.resolve(this.storage.userIdToHandleName);
    }

    public async getChannelData(channelId: string): Promise<ChannelData> {
        const channelData = this.storage.channelData[channelId];
        if (!channelData) {
            throw new Error(`Channel ${channelId} not found`);
        }
        return channelData;
    }

    public async createChannel(params: CreateChannelParams): Promise<UUID> {
        return this.storage.createChannel(params);
    }

    async onAddedToChannel(callback: (channelId: any, params: CreateChannelParams) => void): Promise<void> {
        this.storage.on("addChannel", (newChannelId: string, params: CreateChannelParams) => {
            //if (params.members?.includes(this.userId)) {
                callback(newChannelId, params);
            //}
        });
        return;
    }

    public async addArtifactToChannel(channelId: string, artifactId: string): Promise<void> {
        const channelData = await this.getChannelData(channelId);
        if (!channelData) {
            throw new Error(`Channel ${channelId} not found`);
        }
        
        if (!channelData.artifactIds) {
            channelData.artifactIds = [];
        }
        
        if (!channelData.artifactIds?.includes(artifactId)) {
            channelData.artifactIds?.push(artifactId);
            await this.storage.save();
        }
    }

    public async removeArtifactFromChannel(channelId: string, artifactId: string): Promise<void> {
        const channelData = await this.getChannelData(channelId);
        if (!channelData) {
            throw new Error(`Channel ${channelId} not found`);
        }
        
        if (channelData.artifactIds) {
            channelData.artifactIds = 
                channelData.artifactIds?.filter(id => id !== artifactId);
            await this.storage.save();
        }
    }

    public async deleteChannel(channelId: string): Promise<void> {
        if (!this.storage.channelNames[channelId]) {
            throw new Error(`Channel ${channelId} not found`);
        }
        
        // Remove all posts in the channel
        this.storage.posts = this.storage.posts.filter(p => p.channel_id !== channelId);
        
        // Remove channel metadata
        delete this.storage.channelNames[channelId];
        delete this.storage.channelData[channelId];
        
        await this.storage.save();
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

    public async postInChannel(channelId: string, message: string, props?: Record<string, any>, attachments?: Attachment[]): Promise<ChatPost> {
        // Get the channel's project ID if it exists
        const channelData = this.storage.channelData[channelId];
        const projectId = channelData?.projectId;

        const artifacts = channelData?.artifactIds;
        
        // Merge any existing props with the project ID
        const postProps = {
            ...(props || {}),
            ...(projectId ? { 'project-id': projectId } : {}),
            ...(artifacts&&artifacts.length > 0 ? {"artifact-ids": artifacts} : {})
        };

        const post = new InMemoryPost(
            channelId,
            message,
            this.userId,
            postProps
        );
        if (attachments) {
            post.attachments = attachments;
        }
        await this.pushPost(post);

        return post;
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

    public async postReply(rootId: string, channelId: string, message: string, props?: Record<string, any>): Promise<ChatPost> {
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
            await this.pushPost(replyPost);
            return replyPost;
        } else {
            throw new Error("Coudln't find post or post wasn't a root post to reply to.")
        }
    }

    public replyThreaded(post: ChatPost, response: string, props?: Record<string, any>, attachments?: Attachment[]): Promise<ChatPost> {
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
            if (attachments) {
                replyPost.attachments = attachments;
            }
            this.pushPost(replyPost);
            return Promise.resolve(replyPost);
        } else {
            throw new Error("Coudln't find post or post wasn't a root post to reply to.")
        }    
    }

    private async pushPost(post: ChatPost): Promise<void> {
        this.storage.addPost(post);
        await this.storage.save();
    }
}
