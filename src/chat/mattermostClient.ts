import M from '@mattermost/client';
import WebSocket from 'ws';
import JSON5 from 'json5';
import { Post } from '@mattermost/types/posts';
import { ChatClient } from './chatClient';
import Logger from '../helpers/logger';

export default class MattermostClient implements ChatClient {
    private client: M.Client4;
    private token: string;
    private ws: WebSocket | null = null;
    userId: string;

    constructor(token: string, userId: string) {
        this.token = token;
        this.userId = userId;
        this.client = new M.Client4();
        this.client.setUrl("https://chat.rick-bowman.com");
        this.client.setToken(this.token);
    }

    public async fetchPreviousMessages(channelId: string, limit = 5): Promise<Post[]> {
        const postsList = await this.client.getPosts(channelId, 0, limit);
        const postIds = postsList.order;
        const posts = postIds.map((id) => postsList.posts[id]).reverse();

        Logger.info(`Fetched ${posts.length} previous messages from channel: ${channelId}`);
        Logger.info(posts.map(p => p.message));

        return posts;
    }

    public async postInChannel(channelId: string, message: string, props?: Record<string, any>): Promise<Post> {
        return await this.client.createPost({
            channel_id: channelId,
            message: message,
            props: props,
            metadata: {
                embeds: [
                    {
                        type: 'message_attachment',
                        data: {
                            text: "AI Bot",
                            fields: [
                                {
                                    title: "Bot 1",
                                    value: "Test",
                                    short: true
                                }
                            ]
                        }
                    },
                ],
            }
        });
    }

    public getWebSocketUrl(): string {
        return this.client.getWebSocketUrl();
    }

    public receiveMessages(callback: (data: Post) => void): void {
        Logger.info(`Connectng to WebSocket: ${this.getWebSocketUrl()}`);
        Logger.info(`Using token: ${this.token}`)

        

        const wsClient = new WebSocket(this.getWebSocketUrl(), {
            headers: {
                Authorization: `Bearer ${this.token}`
            }
        });

        wsClient.on('message', async (data) => {
            try {
                const messageData = JSON5.parse(data.toString());

                if (messageData.event === 'posted' &&
                    messageData.data.mentions?.includes(this.userId) &&
                    messageData.data.post.user_id !== this.userId &&
                    messageData.data.post) {
                    const post = JSON5.parse(messageData.data.post);
                    Logger.info(`New post received [${post.id}]: ${post.message}`);
                    callback(post);
                } else if (messageData.event === 'thread_updated' && messageData.data.thread) {
                    const thread = JSON5.parse(messageData.data.thread);
                    const threadPosts = await this.client.getPostThread(thread.post.id, true);
                    Logger.info(`Found ${threadPosts.order.length} thread posts`);
                    const lastThreadPost = threadPosts.posts[threadPosts.order[threadPosts.order.length-1]];
                    if (lastThreadPost.user_id !== this.userId) {
                        Logger.info(`New thread received [${lastThreadPost.id}]: ${lastThreadPost.message}`);
                        callback(lastThreadPost);
                    }
                }
            } catch (error) {
                Logger.error('Error processing incoming message:', error);
            }
        });

        wsClient.on('open', () => {
            Logger.info('WebSocket connection opened');
        });

        wsClient.on('close', () => {
            Logger.info('WebSocket connection closed');
        });

        wsClient.on('error', (err) => {
            Logger.error('WebSocket error:', err);
        });

        this.ws = wsClient;
    }

    public async postReply(rootId: string, channelId: string, message: string): Promise<Post> {
        return await this.client.createPost({
            channel_id: channelId,
            root_id: rootId,
            message: message
        });
    }

    public async createChannel(params: CreateChannelParams): Promise<string> {
        const channel = await this.client.createChannel({
            name: params.name,
            display_name: params.name,
            type: params.isPrivate ? 'private' : 'public',
            description: params.description
        });

        if (params.members) {
            await Promise.all(params.members.map(memberId => 
                this.client.addUserToChannel(memberId, channel.id)
            ));
        }

        return channel.id;
    }

    public async deleteChannel(channelId: string): Promise<void> {
        const channel = await this.client.getChannel(channelId);
        if (!channel) {
            throw new Error(`Channel ${channelId} not found`);
        }

        // Delete all posts in the channel
        const posts = await this.client.getPosts(channelId, 0, 100);
        await Promise.all(posts.order.map(postId => 
            this.client.deletePost(postId)
        ));

        // Delete the channel
        await this.client.deleteChannel(channelId);
    }

    public closeCallback(): void {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }
}
