import { BackendServices } from "../types/BackendServices";
import { ClientMessage } from "../shared/IPCInterface";
import Logger from "../helpers/logger";
import { BackendSettings } from "../types/BackendServices";
import { ChatPost } from "../chat/chatClient";

export class MessageHandler {
    constructor(private services: BackendServices) {}

    async handleSendMessage(message: Partial<ClientMessage>) {
        if (message.thread_id) {
            return await this.services.chatClient.postReply(
                message.thread_id,
                message.channel_id!,
                message.message!,
                message.props
            );
        } else {
            return await this.services.chatClient.postInChannel(
                message.channel_id!,
                message.message!,
                message.props
            );
        }
    }

    async handleGetMessages({ channelId, threadId, limit }: { channelId: string, threadId?: string, limit?: number }) {
        const messages = await this.services.chatClient.fetchPreviousMessages(channelId);
        return messages.map(post => ({
            id: post.id,
            channel_id: post.channel_id,
            message: post.message,
            user_id: post.user_id,
            create_at: post.create_at,
            directed_at: post.directed_at,
            props: post.props,
            thread_id: post.getRootId(),
            reply_count: messages.filter(p => p.getRootId() === post.id).length
        })).slice(-(limit || messages.length));
    }

    async handleGetThreads({ channelId }: { channelId: string }) {
        const posts = await this.services.chatClient.fetchPreviousMessages(channelId);
        const threadMap = new Map<string, any>();
        
        posts.forEach(post => {
            const rootId = post.getRootId();
            if (rootId) {
                // This is a reply - add to existing thread
                if (threadMap.has(rootId)) {
                    threadMap.get(rootId).replies.push({
                        id: post.id,
                        channel_id: post.channel_id,
                        message: post.message,
                        user_id: post.user_id,
                        create_at: post.create_at,
                        directed_at: post.directed_at,
                        props: post.props
                    });
                    // Update last_message_at if this reply is newer
                    if (post.create_at > threadMap.get(rootId).last_message_at) {
                        threadMap.get(rootId).last_message_at = post.create_at;
                    }
                }
            } else {
                // This is a root message - create new thread
                threadMap.set(post.id, {
                    rootMessage: {
                        id: post.id,
                        channel_id: post.channel_id,
                        message: post.message,
                        user_id: post.user_id,
                        create_at: post.create_at,
                        directed_at: post.directed_at,
                        props: post.props
                    },
                    replies: [],
                    last_message_at: post.create_at,
                    channel_id: post.channel_id
                });
            }
        });

        // Convert map to array and sort by last_message_at
        return Array.from(threadMap.values())
            .sort((a, b) => b.last_message_at - a.last_message_at);
    }

    async handleGetChannels() {
        const channels = await this.services.chatClient.getChannels();
        return channels.map(([id, name]) => ({
            id,
            name: name.replace('#', ''),
            description: ''
        }));
    }

    async handleGetTasks({ channelId, threadId }: { channelId: string, threadId?: string }) {
        return await this.services.taskManager.getTasks(channelId, threadId);
    }

    async handleGetArtifacts({ channelId, threadId }: { channelId: string, threadId?: string }) {
        return await this.services.artifactManager.getArtifacts(channelId, threadId);
    }

    async handleGetAllArtifacts() {
        return await this.services.artifactManager.listArtifacts();
    }

    async handleDeleteArtifact(artifactId: string) {
        await this.services.artifactManager.deleteArtifact(artifactId);
        return await this.services.artifactManager.listArtifacts();
    }

    async handleGetSettings() {
        return this.services.settings;
    }

    async handleUpdateSettings(settings: Partial<BackendSettings>) {
        this.services.settings = { ...this.services.settings, ...settings };
        // Update environment variables
        if (settings.provider) process.env.LLM_PROVIDER = settings.provider;
        if (settings.model) process.env.CHAT_MODEL = settings.model;
        if (settings.apiKey) {
            if (settings.provider === 'openai') {
                process.env.OPENAI_API_KEY = settings.apiKey;
            } else if (settings.provider === 'anthropic') {
                process.env.ANTHROPIC_API_KEY = settings.apiKey;
            }
        }
        return this.services.settings;
    }

    async handleGetLogs(logType: string) {
        switch (logType) {
            case 'llm':
                return await this.services.llmLogger.getAllLogs();
            case 'system':
                return this.services.logReader.readLogs();
            case 'api':
                return []; // TODO: Implement API logs
            default:
                return [];
        }
    }

    async handleGetHandles() {
        return await this.services.chatClient.getHandles();
    }

    processArtifactContent(artifact: any) {
        const content = Buffer.isBuffer(artifact.content)
            ? artifact.metadata?.binary 
                ? artifact.content.toString('base64')
                : artifact.content.toString('utf8')
            : artifact.content;
        return { ...artifact, content };
    }
}
