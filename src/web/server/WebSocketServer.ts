import { Server } from 'socket.io';
import { createServer } from 'http';
import express from 'express';
import { Channel, Thread, Message } from '../client/src/services/WebSocketService';
import { InMemoryChatStorage } from '../../chat/inMemoryChatClient';
import { TaskManager } from 'src/tools/taskManager';
import Logger from 'src/helpers/logger';

export class WebSocketServer {
    private io: Server;
    private storage: InMemoryChatStorage;
    private threads: Record<string, Thread[]> = {};
    private messages: Message[] = [];
    private projects: TaskManager;
    private artifactManager: ArtifactManager;

    constructor(storage: InMemoryChatStorage, projects: TaskManager, artifactManager: ArtifactManager, port: number = 4001) {
        this.storage = storage;
        this.projects = projects;
        this.artifactManager = artifactManager;
        
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

            socket.on('get_thread', ({ channel_id, root_id }: { channel_id: string, root_id: string }) => {
                const channelThreads = this.threads[channel_id] || [];
                const thread = channelThreads.find(t => t.rootMessage.id === root_id);
                if (thread) {
                    socket.emit('threads', [thread]);
                }
            });

            socket.on('get_messages', ({ channel_id, thread_id, limit }: { channel_id: string, thread_id?: string, limit: number }) => {
                const channelMessages = this.storage.posts
                    .filter(post => {
                        if (post.channel_id !== channel_id) return false;
                        if (thread_id === '') return !post.getRootId(); // Root messages only
                        if (thread_id) return post.getRootId() === thread_id; // Thread messages
                        return true; // All messages if no thread_id specified
                    })
                    .map(post => ({
                        id: post.id,
                        channel_id: post.channel_id,
                        message: post.message,
                        user_id: post.user_id,
                        create_at: post.create_at,
                        directed_at: post.directed_at,
                        props: post.props
                    }))
                    .slice(-limit);
                socket.emit('messages', channelMessages);
            });

            // Handle messages
            socket.on('message', (message: Partial<Message>) => {
                const fullMessage = {
                    id: Date.now().toString(),
                    channel_id: message.channel_id!,
                    message: message.message!,
                    user_id: message.user_id || 'anonymous',
                    create_at: Date.now(),
                    directed_at: message.directed_at,
                    props: message.props || {},
                    getRootId: function() { 
                        return message.thread_id || null;
                    }
                };

                // Store the message in storage instead of this.messages
                this.storage.posts.push(fullMessage);
                
                // Emit to all clients except sender
                socket.broadcast.emit('message', {
                    id: fullMessage.id,
                    channel_id: fullMessage.channel_id,
                    message: fullMessage.message,
                    user_id: fullMessage.user_id,
                    create_at: fullMessage.create_at,
                    directed_at: fullMessage.directed_at,
                    props: fullMessage.props,
                    thread_id: fullMessage.getRootId()
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
            socket.on('get_artifacts', ({ channel_id, thread_id }: { channel_id: string, thread_id: string | null }) => {
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
                const artifacts = artifactIds.map(id => {
                    try {
                        return this.artifactManager.getArtifact(id);
                    } catch (error) {
                        Logger.error(`Error fetching artifact ${id}:`, error);
                        return null;
                    }
                }).filter(Boolean);

                Logger.log('Sending artifacts:', artifacts);
                socket.emit('artifacts', artifacts);
            });

            socket.on('disconnect', () => {
                Logger.log('Client disconnected');
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
