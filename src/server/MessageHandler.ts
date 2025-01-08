import { BackendServices } from "../types/BackendServices";
import { LLMCallLogger } from "src/llm/LLMLogger";
import { Task } from "src/tools/taskManager";
import { ServerMethods } from "../web/client/src/shared/RPCInterface";
import { ClientChannel, ClientMessage } from "src/web/client/src/shared/IPCInterface";
import Logger from "../helpers/logger";

export class MessageHandler implements ServerMethods {
    createWrapper(): ServerMethods {
        const handler = this;
        return new Proxy({} as ServerMethods, {
            get(target, prop) {
                if (typeof handler[prop as keyof ServerMethods] === 'function') {
                    return async (...args: any[]) => {
                        try {
                            const result = await (handler[prop as keyof ServerMethods] as Function).apply(handler, args);
                            return result;
                        } catch (error) {
                            Logger.error(`Error in wrapped handler method ${String(prop)}:`, error);
                            throw error;
                        }
                    };
                }
                return undefined;
            }
        });
    }
    constructor(private services: BackendServices) { }

    async sendMessage(message: Partial<ClientMessage>): Promise<ClientMessage> {
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

    async getMessages({ channelId, threadId, limit }: { channelId: string; threadId: string | null; limit?: number }): Promise<ClientMessage[]> {
        const messages = await this.services.chatClient.fetchPreviousMessages(channelId, 1000);

        let channelMessages = messages
            .filter(post => post.channel_id === channelId)
            .map(post => {
                // Count replies for this message
                const replyCount = messages.filter(p => p.getRootId() === post.id).length;

                return {
                    id: post.id,
                    channel_id: post.channel_id,
                    message: post.message,
                    user_id: post.user_id,
                    create_at: post.create_at,
                    directed_at: post.directed_at,
                    props: post.props,
                    thread_id: post.getRootId(),
                    reply_count: replyCount
                };
            })
            .slice(-(limit||100));
        return channelMessages;
    }

    async getThreads({ channelId }: { channelId: string }): Promise<ClientThread[]> {
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

    async getChannels(): Promise<ClientChannel[]> {
        const channels = await this.services.chatClient.getChannels();
        return channels.map(([id, name]) => ({
            id,
            name: name.replace('#', ''),
            description: ''
        }));
    }

    async getTasks({ channelId, threadId }: { channelId: string; threadId: string | null }): Promise<any[]> {
        // Get all posts for this channel/thread
        const posts = (await this.services.chatClient.fetchPreviousMessages(channelId, 500)).filter(post => {
            if (threadId) {
                return post.getRootId() === threadId || post.id === threadId;
            }
            return true;
        });

        // Extract project IDs from posts
        const projectIds = [...new Set(posts.map(p => p.props["project-id"]).filter(id => id != undefined))];
        
        // Get tasks from storage that match these project IDs and convert to ClientTask format
        const tasks = projectIds.flatMap(projectId => {
            const project = this.services.taskManager.getProject(projectId);
            if (!project) return [];
            
            return Object.values(project.tasks).map(task => ({
                id: task.id,
                description: task.description,
                inProgress: task.inProgress || false,
                threadId: task.metadata?.threadId || null
            }));
        });

        return tasks;
    }

    async getArtifacts({ channelId, threadId }: { channelId: string; threadId: string | null }): Promise<any[]> {
        const artifacts = await this.services.artifactManager.listArtifacts();
        return artifacts.filter(artifact => {
            const matchesChannel = artifact.metadata?.channelId === channelId;
            const matchesThread = !threadId || artifact.metadata?.threadId === threadId;
            return matchesChannel && matchesThread;
        }).map(artifact => this.processArtifactContent(artifact));
    }

    async getAllArtifacts(): Promise<any[]> {
        return (await this.services.artifactManager.listArtifacts())
            .map(artifact => this.processArtifactContent(artifact));
    }

    async deleteArtifact(artifactId: string): Promise<any[]> {
        await this.services.artifactManager.deleteArtifact(artifactId);
        return this.handleGetAllArtifacts();
    }

    async getSettings(): Promise<any> {
        return this.services.settings;
    }

    async updateSettings(settings: any): Promise<any> {
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

    async getLogs(logType: 'llm' | 'system' | 'api'): Promise<any> {
        switch (logType) {
            case 'llm':
                return await LLMCallLogger.getAllLogs();
            case 'system':
                return this.services.logReader.readLogs();
            case 'api':
                return []; // TODO: Implement API logs
            default:
                return [];
        }
    }

    async getHandles(): Promise<Array<{id: string; handle: string}>> {
        const handleSet = await this.services.chatClient.getHandles();
        const handles = Object.entries(handleSet).map(([id, name]) => ({
            id,
            handle: name
        }));
        return handles;
    }

    processArtifactContent(artifact: any) {
        const content = Buffer.isBuffer(artifact.content)
            ? artifact.metadata?.binary
                ? artifact.content.toString('base64')
                : artifact.content.toString('utf8')
            : artifact.content.toString();
        return { ...artifact, content };
    }
}
