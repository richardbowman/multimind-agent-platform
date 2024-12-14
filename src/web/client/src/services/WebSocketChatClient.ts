import { ChatClient, ChatPost, ConversationContext, ProjectChainResponse } from '../../../chat/chatClient';
import { webSocketService } from './WebSocketService';

export class WebSocketChatClient implements ChatClient {
    private handleName: string = '';

    async getThreadChain(post: ChatPost): Promise<ChatPost[]> {
        if (!post.thread_id) {
            return [post];
        }
        // Fetch thread messages through websocket
        return new Promise((resolve) => {
            webSocketService.fetchThreads(post.channel_id);
            const unsubscribe = webSocketService.onThreads((threads) => {
                const threadPosts = threads
                    .filter(t => t.id === post.thread_id)
                    .map(t => ({ ...t, props: {} } as ChatPost));
                unsubscribe();
                resolve(threadPosts);
            });
        });
    }

    async getPost(confirmationPostId: string): Promise<ChatPost> {
        // Implementation depends on how you want to fetch individual posts
        throw new Error('Method not implemented.');
    }

    async fetchPreviousMessages(channelId: string, limit: number = 50): Promise<ChatPost[]> {
        return new Promise((resolve) => {
            webSocketService.fetchMessages(channelId, limit);
            const unsubscribe = webSocketService.onMessages((messages) => {
                const posts = messages.map(m => ({ ...m, props: {} } as ChatPost));
                unsubscribe();
                resolve(posts);
            });
        });
    }

    async findProjectChain(channelId: string, postRootId: string): Promise<ProjectChainResponse> {
        const posts = await this.getThreadChain({ id: postRootId, channel_id: channelId } as ChatPost);
        return {
            activityType: posts[0]?.getActivityType() || null,
            posts,
            projectId: posts[0]?.props?.['project-id'] || ''
        };
    }

    async postInChannel(channelId: string, message: string, props?: Record<string, any>): Promise<ChatPost> {
        return new Promise((resolve) => {
            const msg = {
                channel_id: channelId,
                message,
                props,
                user_id: this.handleName
            };
            webSocketService.sendMessage(msg);
            const unsubscribe = webSocketService.onMessage((sentMessage) => {
                if (sentMessage.message === message) {
                    unsubscribe();
                    resolve(sentMessage as ChatPost);
                }
            });
        });
    }

    receiveMessages(callback: (data: ChatPost) => void): void {
        webSocketService.onMessage((message) => {
            callback(message as ChatPost);
        });
    }

    closeCallback(): void {
        webSocketService.disconnect();
    }

    async postReply(rootId: string, channelId: string, message: string, props?: Record<string, any>): Promise<ChatPost> {
        return this.replyThreaded({ id: rootId, channel_id: channelId } as ChatPost, message, props);
    }

    async replyThreaded(post: ChatPost, response: string, props?: ConversationContext): Promise<ChatPost> {
        return new Promise((resolve) => {
            const msg = {
                channel_id: post.channel_id,
                thread_id: post.id,
                message: response,
                props,
                user_id: this.handleName
            };
            webSocketService.sendMessage(msg);
            const unsubscribe = webSocketService.onMessage((sentMessage) => {
                if (sentMessage.message === response) {
                    unsubscribe();
                    resolve(sentMessage as ChatPost);
                }
            });
        });
    }

    registerHandle(handleName: string): void {
        this.handleName = handleName;
    }
}

export const webSocketChatClient = new WebSocketChatClient();
export default webSocketChatClient;
