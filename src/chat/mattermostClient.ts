import M from '@mattermost/client';
import WebSocket from 'ws';
import JSON5 from 'json5';
import { Post } from '@mattermost/types/posts';
import { ChatClient } from './chatClient';
import Logger from 'src/helpers/logger';

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

    public async findProjectChain(channelId: string, postRootId: string): Promise<ProjectChainResponse> {
        const team = await this.client.getTeamByName("RickTest");
        const post = await this.client.getPost(postRootId);

        // Regular expression pattern to match UUIDs
        const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

        // Use the `match` method to find the UUID in the message
        const match = post.message.match(uuidPattern);

        if (match) {
            const uuid = match[0];
            Logger.info("Extracted UUID:", uuid);
            // Extract activity type from message
            Logger.info('Message Props: ', post.props);
            const activityType = post.props['activity-type'];
            const response = await this.client.searchPosts(team.id, "PROJECT ID", false);
            const projectPost = response.order.map(id => response.posts[id]).find(p => p.message.includes(uuid));

            if (projectPost) {
                Logger.info("Found project in channel:", projectPost.id);

                (response);
                const thread = await this.client.getPostThread(projectPost.id);

                (thread);
                Logger.info(`Found ${thread.order.length} threads for post: ${projectPost.id}`);
                (thread.order.map((id) => thread.posts[id].message));

                return {
                    activityType,
                    posts: thread.order.map((id) => thread.posts[id]),
                    projectId: uuid
                };
            } else {
                throw new Error("No project found in channel.");
            }
        } else {
            throw new Error("No UUID found in the message: " + post.message);
        }
    }

    public async createPost(channelId: string, message: string, props?: Record<string, any>): Promise<Post> {
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

    public initializeWebSocket(callback: (data: Post) => void): void {
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

    public closeWebSocket(): void {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }
}