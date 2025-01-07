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
        this.handler = new MessageHandler(services);
        
        const app = express();
        this.httpServer = createServer(app);
        
        this.io = new Server(this.httpServer, {
            cors: {
                origin: `${PROTOCOL}://${HOST}:${PORT}`,
                methods: ["GET", "POST"]
            }
        });

        // Set up message receiving for the user client
        services.chatClient.receiveMessages((post: ChatPost) => {
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

        this.setupSocketHandlers();
        
        this.httpServer.listen(PORT, () => {
            Logger.info(`WebSocket server running on port ${PORT}`);
        });
    }

    private setupSocketHandlers() {
        this.io.on('connection', (socket) => {
            Logger.info('Client connected');

            socket.on('get_channels', async () => {
                const channels = await this.handler.handleGetChannels();
                socket.emit('channels', channels);
            });

            socket.on('get_threads', async ({ channel_id }) => {
                const threads = await this.handler.handleGetThreads({ channelId: channel_id });
                socket.emit('threads', threads);
            });

            socket.on('get_messages', async ({ channel_id, thread_id, limit }) => {
                const messages = await this.handler.handleGetMessages({ 
                    channelId: channel_id, 
                    threadId: thread_id, 
                    limit 
                });
                socket.emit('messages', messages);
            });

            socket.on('send_message', async (message) => {
                const result = await this.handler.handleSendMessage(message);
                this.io.emit('message', result);
            });

            socket.on('get_tasks', async ({ channel_id, thread_id }) => {
                const tasks = await this.handler.handleGetTasks({ 
                    channelId: channel_id, 
                    threadId: thread_id 
                });
                socket.emit('tasks', tasks);
            });

            socket.on('get_artifacts', async ({ channel_id, thread_id }) => {
                const artifacts = await this.handler.handleGetArtifacts({ 
                    channelId: channel_id, 
                    threadId: thread_id 
                });
                socket.emit('artifacts', artifacts);
            });

            socket.on('get_all_artifacts', async () => {
                const artifacts = await this.handler.handleGetAllArtifacts();
                socket.emit('artifacts', artifacts);
            });

            socket.on('delete_artifact', async (artifactId) => {
                const artifacts = await this.handler.handleDeleteArtifact(artifactId);
                this.io.emit('artifacts', artifacts);
            });

            socket.on('get_logs', async (logType) => {
                const logs = await this.handler.handleGetLogs(logType);
                socket.emit('logs', { type: logType, data: logs });
            });

            socket.on('get_handles', async () => {
                const handles = await this.handler.handleGetHandles();
                socket.emit('handles', handles);
            });

            socket.on('getSettings', async () => {
                const settings = await this.handler.handleGetSettings();
                socket.emit('settings', settings);
            });

            socket.on('updateSettings', async (newSettings) => {
                const settings = await this.handler.handleUpdateSettings(newSettings);
                socket.emit('settingsUpdated', settings);
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
