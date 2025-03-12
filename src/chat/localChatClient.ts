import Logger from "../helpers/logger";
import { Attachment, ChatClient, ChatPost, ConversationContext, isValidChatPost, ProjectChainResponse } from "../chat/chatClient";
import * as fs from "fs/promises";
import { AsyncQueue } from "../helpers/asyncQueue";
import { ChannelData, ChannelHandle, CreateChannelParams } from "src/shared/channelTypes";
import { EventEmitter } from "stream";
import { _getPathRecursive } from "@langchain/core/dist/utils/fast-json-patch/src/helpers";
import { createUUID, UUID } from "src/types/uuid";
import { ChatHandle } from "src/types/chatHandle";

export class InMemoryPost implements ChatPost {
    static fromLoad(postData: any): InMemoryPost {
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

    public id: UUID;
    public channel_id: UUID;
    public message: string;
    public user_id: UUID;
    public props: ConversationContext;
    public create_at: number;
    public directed_at: string;
    public attachments?: Attachment[];

    constructor(channel_id: UUID, message: string, user_id: UUID, props?: Record<string, any>, create_at?: number) {
        this.id = createUUID();
        this.channel_id = channel_id;
        this.message = message;
        this.user_id = user_id;
        this.props = props || {};
        this.create_at = create_at || Date.now();
        this.directed_at = props?.directed_at;
    }

    public getRootId(): UUID | null {
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

import { ChatPostModel, ChannelDataModel, UserHandleModel } from './chatModels';
import { Sequelize } from "sequelize";

export class LocalChatStorage extends EventEmitter {
    private sequelize: Sequelize;
    private callbacks: Function[] = [];

    constructor(sequelize: Sequelize) {
        super();
        this.sequelize = sequelize;
        this.setMaxListeners(100);
        
        // Initialize models
        ChatPostModel.initialize(sequelize);
        ChannelDataModel.initialize(sequelize);
        UserHandleModel.initialize(sequelize);
    }

    async createChannel(params: CreateChannelParams): Promise<UUID> {
        const channel = await ChannelDataModel.create({
            ...params,
            id: createUUID()
        });

        this.emit("addChannel", channel.id, params);
        return channel.id;
    }

    public async addPost(post: ChatPost): Promise<void> {
        if (!isValidChatPost(post)) {
            Logger.error(`Invalid post ${JSON.stringify(post, null, 2)}`);
            return;
        }
        
        await ChatPostModel.create({
            ...post,
            attachments: post.attachments || []
        });
        
        this.callbacks.forEach(c => c(post));
    }

    public async registerChannel(channelId: UUID, channelName: ChannelHandle) {
        await ChannelDataModel.update({ name: channelName }, { where: { id: channelId } });
    }

    public async mapUserIdToHandleName(userId: UUID, handleName: ChatHandle) {
        await UserHandleModel.upsert({
            user_id: userId,
            handle: handleName
        });
    }

    public async getHandleNameForUserId(userId: string): Promise<string | undefined> {
        const handle = await UserHandleModel.findOne({ where: { user_id: userId } });
        return handle?.handle;
    }

    public async sync(): Promise<void> {
        await this.sequelize.sync();
    }

    public async getChannels() : Promise<ChannelDataModel[]> {
        const channels = await ChannelDataModel.findAll();
        return channels;
    }

    public async announceChannels() {
        (await this.getChannels()).forEach(channel => {
            this.emit("addChannel", channel.id, {
                name: channel.name,
                description: channel.description,
                members: channel.members,
                defaultResponderId: channel.defaultResponderId,
                projectId: channel.projectId
            } as CreateChannelParams);
        });
    }
}

export class LocalTestClient implements ChatClient {
    private webSocketUrl: string;
    private userId: UUID;
    private callback: (data: ChatPost) => void = () => { };
    storage: LocalChatStorage;

    constructor(userId: UUID, webSocketUrl: string, storage: LocalChatStorage) {
        this.userId = userId;
        this.webSocketUrl = webSocketUrl;
        this.storage = storage;
    }

    public registerHandle(handleName: ChatHandle) {
        this.storage.mapUserIdToHandleName(this.userId, handleName);
    }

    public async getChannels(): Promise<ChannelData[]> {
        const channels = await ChannelDataModel.findAll();
        return channels.map(channel => ({
            id: channel.id,
            name: channel.name,
            description: channel.description,
            members: channel.members,
            defaultResponderId: channel.defaultResponderId,
            projectId: channel.projectId,
            artifactIds: channel.artifactIds,
            goalTemplateId: channel.goalTemplate
        }));
    }

    public async getHandles(): Promise<Record<UUID, ChatHandle>> {
        const handles = await UserHandleModel.findAll();
        const result: Record<UUID, ChatHandle> = {};
        handles.forEach(handle => {
            result[handle.user_id] = handle.handle;
        });
        return result;
    }

    public async getChannelData(channelId: string): Promise<ChannelData> {
        const channel = await ChannelDataModel.findByPk(channelId);
        if (!channel) {
            throw new Error(`Channel ${channelId} not found`);
        }
        
        return {
            id: channel.id,
            name: channel.name,
            description: channel.description,
            members: channel.members || [],
            defaultResponderId: channel.defaultResponderId,
            projectId: channel.projectId,
            artifactIds: channel.artifactIds || [],
            goalTemplate: channel.goalTemplate
        };
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

    public async addArtifactToChannel(channelId: UUID, artifactId: UUID): Promise<void> {
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

    public async getPosts(): Promise<ChatPost[]> {
        const posts = await ChatPostModel.findAll();
        return posts.map(post => new InMemoryPost(
            post.channel_id,
            post.message,
            post.user_id,
            post.props,
            post.create_at
        ));
    }

    public async fetchPreviousMessages(channelId: string, limit: number = 5): Promise<ChatPost[]> {
        const posts = await ChatPostModel.findAll({
            where: { channel_id: channelId },
            order: [['create_at', 'DESC']],
            limit
        });
        return posts.map(post => new InMemoryPost(
            post.channel_id,
            post.message,
            post.user_id,
            post.props,
            post.create_at
        ));
    }

    public async getPost(id: string): Promise<ChatPost> {
        const post = await ChatPostModel.findByPk(id);
        if (!post) {
            throw new Error(`Could not find post ${id}`);
        }
        return new InMemoryPost(
            post.channel_id,
            post.message,
            post.user_id,
            post.props,
            post.create_at
        );
    }

    public async postInChannel(channelId: string, message: string, props?: Record<string, any>, attachments?: Attachment[]): Promise<ChatPost> {
        // Get the channel's project ID if it exists
        const channelData = await this.getChannelData(channelId);
        const projectId = channelData?.projectId;

        const artifactIds = [...channelData?.artifactIds ?? [], ...props?.artifactIds ?? []].filter(id => id !== undefined);

        // Merge any existing props with the project ID
        const postProps = {
            ...(props || {}),
            ...(projectId ? { 'project-ids': [projectId] } : {}),
            ...(artifactIds?.length ?? 0 > 0 ? { artifactIds } : {})
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
        const replyProps = props || {};
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

    public async replyThreaded(post: ChatPost, response: string, props?: Record<string, any>, attachments?: Attachment[]): Promise<ChatPost> {
        const rootId = post.getRootId() || post.id;
        const replyProps: Record<string, any> = props || {};
        replyProps['root-id'] = rootId;

        const posts = await this.getPosts();
        const rootPost = posts.find(p => p.id === rootId);
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
            await this.pushPost(replyPost);
            return replyPost;
        } else {
            throw new Error("Couldn't find post or post wasn't a root post to reply to.")
        }
    }

    public async updatePost(postId: UUID, newContent: string, newProps?: ConversationContext): Promise<ChatPost> {
        const post = this.storage.posts.find(p => p.id === postId);
        if (!post) {
            throw new Error(`Post ${postId} not found`);
        }

        post.message = newContent;
        post.update_at = Date.now();
        if (newProps) {
            post.props = { ...post.props, ...newProps };
        }

        await this.storage.sync();

        // Notify listeners of the update
        this.storage.callbacks.forEach(c => {
            try {
                c(post)
            } catch (e) {
                Logger.error(`Error calling chat client callbacks.`, e);
            }
        });

        return post;
    }

    private async pushPost(post: ChatPost): Promise<void> {
        this.storage.addPost(post);
        await this.storage.sync();
    }
}
