import { Server } from 'socket.io';
import { createServer } from 'http';
import express from 'express';
import Logger from '../../helpers/logger';
import { HOST, PORT, PROTOCOL } from '../../helpers/config';
import { MessageHandler } from '../../server/MessageHandler';
import { BackendServices } from '../../types/BackendServices';

export class WebSocketServer {
    private io: Server;
    private httpServer: ReturnType<typeof createServer>;
    private handler: MessageHandler;

    constructor(services: BackendServices, port: number = PORT) {
        this.logReader = new LogReader();
        this.storage = storage;
        this.projects = projects;
        this.artifactManager = artifactManager;
        this.userClient = userClient;
        
        // Set up message receiving for the user client
        userClient.receiveMessages((post: ChatPost) => {
            this.io.emit('message', {
                id: post.id,
                channel_id: post.channel_id,
                message: post.message,
                user_id: post.user_id,
                create_at: post.create_at,
                directed_at: post.directed_at,
                props: post.props,
                thread_id: post.getRootId()
            });
        });
        
        const app = express();
        this.httpServer = createServer(app);
        
        this.io = new Server(this.httpServer, {
            cors: {
                origin: `${PROTOCOL}://${HOST}:${PORT}`,
                methods: ["GET", "POST"]
            }
        });

        this.setupSocketHandlers();
        
        this.httpServer.listen(PORT, () => {
            Logger.info(`WebSocket server running on port ${PORT}`);
        });
    }

    private setupSocketHandlers() {
        this.io.on('connection', (socket) => {
            Logger.info('Client connected');

            // Handle channel requests
            socket.on('get_channels', () => {
                const channels = Object.entries(this.storage.channelNames).map(([id, name]) => ({
                    id: id,
                    name: name.replace('#', ''),
                    description: '' // Optional description field
                }));
                socket.emit('channels', channels);
            });

            // Handle thread requests
            socket.on('get_threads', ({ channel_id }: { channel_id: string }) => {
                // Get all posts for this channel
                const posts = this.storage.posts.filter(post => post.channel_id === channel_id);
                
                // Group posts by thread_id
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
                const threads = Array.from(threadMap.values())
                    .sort((a, b) => b.last_message_at - a.last_message_at);

                socket.emit('threads', threads);
            });


            socket.on('get_messages', ({ channel_id, thread_id, limit }: { channel_id: string, thread_id?: string, limit: number }) => {
                Logger.log('Received get_messages request:', { channel_id, thread_id, limit });
                
                let channelMessages = this.storage.posts
                    .filter(post => post.channel_id === channel_id)
                    .map(post => {
                        // Count replies for this message
                        const replyCount = this.storage.posts.filter(p => p.getRootId() === post.id).length;
                        
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
                    .slice(-limit);

                Logger.log('Sending messages to client:', channelMessages);
                // Always emit an empty array if no messages found
                socket.emit('messages', channelMessages);
            });

            // Handle messages
            socket.on('send_message', (message: Partial<ClientMessage>) => {
                const fullMessage : InMemoryPost = {
                    id: Date.now().toString(),
                    channel_id: message.channel_id!,
                    message: message.message!,
                    user_id: message.user_id || 'anonymous',
                    create_at: Date.now(),
                    directed_at: message.directed_at,
                    props: message.props || {},
                    thread_id: message.thread_id || null,
                    getRootId: function() { 
                        return this.thread_id || null;
                    }
                };

                // Send the message through the storage system
                if (fullMessage.getRootId()) {
                    this.userClient.postReply(fullMessage.getRootId(), fullMessage.channel_id, fullMessage.message, fullMessage.props);
                } else {
                    this.userClient.postInChannel(fullMessage.channel_id, fullMessage.message, fullMessage.props);
                }
                
                // Count replies for this message
                const replyCount = this.storage.posts.filter(p => p.getRootId() === fullMessage.id).length;

                // If this is a threaded message, update the thread
                const rootId = fullMessage.getRootId();
                if (rootId) {
                    this.updateThread(fullMessage);
                }
            });

            // Handle task requests
            socket.on('get_tasks', ({ channel_id, thread_id }: { channel_id: string, thread_id: string | null }) => {
                // Get all posts for this channel/thread
                const posts = this.storage.posts.filter(post => {
                    if (post.channel_id !== channel_id) return false;
                    if (thread_id) {
                        return post.getRootId() === thread_id || post.id === thread_id;
                    }
                    return true;
                });

                // Extract project IDs from posts
                const projectIds = [...new Set(posts.map(p => p.props["project-id"]).filter(Boolean))];
                
                // Get tasks from storage that match these project IDs
                const tasks = projectIds.flatMap(projectId => {
                    const project = this.projects.getProject(projectId);
                    return project ? Object.values(project.tasks) : [];
                });

                // Ensure we're sending an array even if no tasks found
                const tasksToSend = tasks || [];
                Logger.log('Sending tasks:', tasksToSend);
                socket.emit('tasks', tasksToSend);
            });

            // Handle task updates
            socket.on('tasks', (tasks: any[]) => {
                this.io.emit('tasks', tasks);
            });

            // Handle artifact requests
            socket.on('get_artifacts', async ({ channel_id, thread_id }: { channel_id: string, thread_id: string | null }) => {
                // Get all posts for this channel/thread
                const posts = this.storage.posts.filter(post => {
                    if (post.channel_id !== channel_id) return false;
                    if (thread_id) {
                        return post.getRootId() === thread_id || post.id === thread_id;
                    }
                    return true;
                });

                // Extract artifact IDs from posts
                const artifactIds = [...new Set(posts.flatMap(p => p.props["artifact-ids"] || []))];
                
                // Get artifacts from storage that match these IDs
                const artifactsList = (await Promise.all(artifactIds.map(id => {
                    try {
                        return this.artifactManager.loadArtifact(id);
                    } catch (error) {
                        Logger.error(`Error fetching artifact ${id}:`, error);
                        return null;
                    }
                })));

                const artifacts = artifactsList.filter(a => a?.id);
                
                // Process artifacts content before sending
                const processedArtifacts = artifacts.map(artifact => {
                    const content = Buffer.isBuffer(artifact.content)
                        ? artifact.metadata?.binary 
                            ? artifact.content.toString('base64')  // Binary content as base64
                            : artifact.content.toString('utf8')    // Text content as UTF-8
                        : artifact.content;
                    return { ...artifact, content };
                });

                Logger.verbose(`Sending ${processedArtifacts.length} artifacts`);
                socket.emit('artifacts', processedArtifacts);
            });

            // Handle get_all_artifacts request
            socket.on('get_all_artifacts', async () => {
                try {
                    const artifacts = await this.artifactManager.listArtifacts();
                    // Convert Buffer content to string before sending
                    const processedArtifacts = artifacts.map(artifact => {
                        const content = Buffer.isBuffer(artifact.content)
                            ? artifact.metadata?.binary 
                                ? artifact.content.toString('base64')  // Binary content as base64
                                : artifact.content.toString('utf8')    // Text content as UTF-8
                            : artifact.content;
                        return { ...artifact, content };
                    });
                    Logger.verbose('Sending all artifacts');
                    socket.emit('artifacts', processedArtifacts);
                } catch (error) {
                    Logger.error('Error fetching all artifacts:', error);
                    socket.emit('artifacts', []);
                }
            });

            socket.on('delete_artifact', async (artifactId: string) => {
                try {
                    await this.artifactManager.deleteArtifact(artifactId);
                    Logger.info(`Deleted artifact ${artifactId}`);
                    // Refresh artifacts list for all clients
                    const artifacts = await this.artifactManager.listArtifacts();
                    const processedArtifacts = artifacts.map(artifact => {
                        const content = Buffer.isBuffer(artifact.content)
                            ? artifact.metadata?.binary 
                                ? artifact.content.toString('base64')
                                : artifact.content.toString('utf8')
                            : artifact.content;
                        return { ...artifact, content };
                    });
                    this.io.emit('artifacts', processedArtifacts);
                } catch (error) {
                    Logger.error(`Error deleting artifact ${artifactId}:`, error);
                }
            });

            // Handle log requests
            socket.on('get_logs', async (logType: string) => {
                Logger.info('Received get_logs request with type:', logType);
                try {
                    switch (logType) {
                        case 'llm':
                            const llmLogs = await LLMCallLogger.getAllLogs();
                            Logger.verbose(`Sending LLM ${Object.keys(llmLogs).length} logs:`);
                            socket.emit('logs', { type: 'llm', data: llmLogs });
                            break;
                        case 'system':
                            const systemLogs = this.logReader.readLogs();
                            Logger.verbose(`Sending ${systemLogs.length} system logs`);
                            socket.emit('logs', { type: 'system', data: systemLogs });
                            break;
                        case 'api':
                            // TODO: Implement API logs
                            socket.emit('logs', { type: 'api', data: [] });
                            break;
                        default:
                            Logger.warn('Unknown log type requested');
                            socket.emit('logs', { type: 'unknown', data: [] });
                    }
                } catch (error) {
                    Logger.error('Error fetching logs:', error);
                    socket.emit('logs', { type: socket.handshake.query.logType, data: [] });
                }
            });

            // Handle user handles requests
            socket.on('get_handles', () => {
                const handles = Object.entries(this.storage.userIdToHandleName).map(([id, name]) => ({
                    id,
                    handle: name
                }));
                Logger.log('Sending handles to client:', handles);
                Logger.log('Raw userIdToHandleName:', this.storage.userIdToHandleName);
                socket.emit('handles', handles);
            });

            // Handle settings requests
            socket.on('getSettings', () => {
                socket.emit('settings', {
                    provider: this.settings.provider,
                    model: this.settings.model,
                    apiKey: this.settings.apiKey
                });
            });

            socket.on('updateSettings', (newSettings) => {
                this.settings = {
                    ...this.settings,
                    ...newSettings
                };
                // Update environment variables
                process.env.LLM_PROVIDER = newSettings.provider;
                process.env.CHAT_MODEL = newSettings.model;
                if (newSettings.provider === 'openai') {
                    process.env.OPENAI_API_KEY = newSettings.apiKey;
                } else if (newSettings.provider === 'anthropic') {
                    process.env.ANTHROPIC_API_KEY = newSettings.apiKey;
                }
                Logger.info('Settings updated');
                socket.emit('settingsUpdated', this.settings);
            });

            socket.on('disconnect', () => {
                Logger.info('Client disconnected');
            });
        });
    }

    async close(): Promise<void> {
        return new Promise((resolve) => {
            this.io.close(() => {
                this.httpServer.close(() => {
                    resolve();
                });
            });
        });
    }

    private updateThread(message: ClientMessage) {
        const rootId = message.getRootId();
        if (!rootId || !message.channel_id) return;

        const channelThreads = this.threads[message.channel_id] || [];
        const existingThread = channelThreads.find(t => t.rootMessage.id === rootId);

        if (existingThread) {
            existingThread.replies = [...existingThread.replies, message];
            existingThread.last_message_at = message.create_at;
        } else {
            const newThread: ClientThread = {
                rootMessage: message,
                replies: [],
                last_message_at: message.create_at,
                channel_id: message.channel_id
            };
            this.threads[message.channel_id] = [...channelThreads, newThread];
        }
        this.io.emit('threads', this.threads[message.channel_id]);
    }
}
