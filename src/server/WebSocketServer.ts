import { Server } from 'socket.io';
import { createServer } from 'http';
import express from 'express';
import { createBirpc } from 'birpc';
import Logger from '../helpers/logger';
import { HOST, PORT, PROTOCOL } from '../helpers/config';
import { MessageHandler } from './MessageHandler';
import { BackendServices } from '../types/BackendServices';
import type { ServerMethods, ClientMethods } from '../shared/RPCInterface';
import type { ChatPost } from '../chat/chatClient';

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
            this.io.emit('birpc', JSON.stringify({
                type: 'onMessage',
                data: [{
                    id: post.id,
                    channel_id: post.channel_id,
                    message: post.message,
                    user_id: post.user_id,
                    create_at: post.create_at,
                    directed_at: post.directed_at,
                    props: post.props,
                    thread_id: post.getRootId()
                }]
            }));
        });

        this.setupSocketHandlers();
        
        this.httpServer.listen(PORT, () => {
            Logger.info(`WebSocket server running on port ${PORT}`);
        });
    }

    private setupSocketHandlers() {
        this.io.on('connection', (socket) => {
            Logger.info('Client connected');

            // Create birpc instance for this connection
            const rpc = createBirpc<ServerMethods, ClientMethods>(
                {
                    // Implement all ServerMethods
                    sendMessage: async (message) => {
                        const result = await this.handler.handleSendMessage(message);
                        return result;
                    },
                    getMessages: async ({ channelId, threadId, limit }) => {
                        return this.handler.handleGetMessages({ 
                            channelId, 
                            threadId, 
                            limit 
                        });
                    },
                    getChannels: async () => {
                        return this.handler.handleGetChannels();
                    },
                    getThreads: async ({ channelId }) => {
                        return this.handler.handleGetThreads({ channelId });
                    },
                    getTasks: async ({ channelId, threadId }) => {
                        return this.handler.handleGetTasks({ 
                            channelId, 
                            threadId 
                        });
                    },
                    getArtifacts: async ({ channelId, threadId }) => {
                        return this.handler.handleGetArtifacts({ 
                            channelId, 
                            threadId 
                        });
                    },
                    getAllArtifacts: async () => {
                        return this.handler.handleGetAllArtifacts();
                    },
                    deleteArtifact: async (artifactId) => {
                        return this.handler.handleDeleteArtifact(artifactId);
                    },
                    getLogs: async (logType) => {
                        return this.handler.handleGetLogs(logType);
                    },
                    getHandles: async () => {
                        return this.handler.handleGetHandles();
                    },
                    getSettings: async () => {
                        return this.handler.handleGetSettings();
                    },
                    updateSettings: async (settings) => {
                        return this.handler.handleUpdateSettings(settings);
                    }
                },
                {
                    post: (data) => socket.emit('birpc', data),
                    on: (handler) => socket.on('birpc', handler),
                    serialize: JSON.stringify,
                    deserialize: JSON.parse,
                }
            );

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
}
