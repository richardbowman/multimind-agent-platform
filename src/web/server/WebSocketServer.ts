import { Server } from 'socket.io';
import { createServer } from 'http';
import express from 'express';
import { Channel, Thread, Message } from '../client/src/services/WebSocketService';
import { LogReader } from './LogReader';
import { InMemoryChatStorage, InMemoryPost, InMemoryTestClient } from '../../chat/inMemoryChatClient';
import { TaskManager } from 'src/tools/taskManager';
import Logger from 'src/helpers/logger';
import { ArtifactManager } from 'src/tools/artifactManager';
import { ChatPost, isValidChatPost } from 'src/chat/chatClient';

export class WebSocketServer {
    private io: Server;
    private storage: InMemoryChatStorage;
    private threads: Record<string, Thread[]> = {};
    private projects: TaskManager;
    private artifactManager: ArtifactManager;
    private userClient: InMemoryTestClient;
    private logReader: LogReader;

    constructor(storage: InMemoryChatStorage, projects: TaskManager, artifactManager: ArtifactManager, userClient: InMemoryTestClient, port: number = 4001) {
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
        const httpServer = createServer(app);
        
        this.io = new Server(httpServer, {
            cors: {
                origin: "http://localhost:3000",
                methods: ["GET", "POST"]
            }
        });

        this.setupSocketHandlers();
        
        httpServer.listen(port, () => {
            Logger.log(`WebSocket server running on port ${port}`);
        });
    }

    private setupSocketHandlers() {
        this.io.on('connection', (socket) => {
            Logger.log('Client connected');

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
                    .filter(post => {
                        // First filter by channel
                        if (post.channel_id !== channel_id) return false;
                        
                        if (thread_id) {
                            // In thread view: show root message and all replies
                            return post.id === thread_id || post.getRootId() === thread_id;
                        } else {
                            // In channel view: only show root messages
                            return !post.getRootId();
                        }
                    })
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
                // Ensure we always send an array, even if empty
                socket.emit('messages', channelMessages || []);
            });

            // Handle messages
            socket.on('message', (message: Partial<Message>) => {
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

                // Emit to all clients including sender
                this.io.emit('message', {
                    id: fullMessage.id,
                    channel_id: fullMessage.channel_id,
                    message: fullMessage.message,
                    user_id: fullMessage.user_id,
                    create_at: fullMessage.create_at,
                    directed_at: fullMessage.directed_at,
                    props: fullMessage.props,
                    thread_id: fullMessage.thread_id || null,
                    reply_count: replyCount,
                    getRootId: function() { 
                        return this.thread_id || null;
                    }
                });

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

                Logger.info(`Sending ${processedArtifacts.length} artifacts`);
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
                    Logger.info('Sending all artifacts');
                    socket.emit('artifacts', processedArtifacts);
                } catch (error) {
                    Logger.error('Error fetching all artifacts:', error);
                    socket.emit('artifacts', []);
                }
            });

            // Handle log requests
            socket.on('get_logs', () => {
                const logs = this.logReader.readLogs();
                socket.emit('logs', logs);
            });

            socket.on('disconnect', () => {
                Logger.info('Client disconnected');
            });
        });
    }

    private updateThread(message: Message) {
        const rootId = message.getRootId();
        if (!rootId || !message.channel_id) return;

        const channelThreads = this.threads[message.channel_id] || [];
        const existingThread = channelThreads.find(t => t.rootMessage.id === rootId);

        if (existingThread) {
            existingThread.replies = [...existingThread.replies, message];
            existingThread.last_message_at = message.create_at;
        } else {
            const newThread: Thread = {
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
