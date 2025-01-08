import { Server } from 'socket.io';
import { createServer } from 'http';
import express from 'express';
import { createBirpc } from 'birpc';
import { createSafeServerRPCHandlers } from './rpcUtils';
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
                        try {
                            const result = await this.handler.handleSendMessage(message);
                            return result;
                        } catch (error) {
                            Logger.error('Error in sendMessage:', error);
                            throw error;
                        }
                    },
                    getMessages: async ({ channelId, threadId, limit }) => {
                        try {
                            return await this.handler.handleGetMessages({ 
                                channelId, 
                                threadId, 
                                limit 
                            });
                        } catch (error) {
                            Logger.error('Error in getMessages:', error);
                            throw error;
                        }
                    },
                    getChannels: async () => {
                        try {
                            return await this.handler.handleGetChannels();
                        } catch (error) {
                            Logger.error('Error in getChannels:', error);
                            throw error;
                        }
                    },
                    getThreads: async ({ channelId }) => {
                        try {
                            return await this.handler.handleGetThreads({ channelId });
                        } catch (error) {
                            Logger.error('Error in getThreads:', error);
                            throw error;
                        }
                    },
                    getTasks: async ({ channelId, threadId }) => {
                        try {
                            return await this.handler.handleGetTasks({ 
                                channelId, 
                                threadId 
                            });
                        } catch (error) {
                            Logger.error('Error in getTasks:', error);
                            throw error;
                        }
                    },
                    getArtifacts: async ({ channelId, threadId }) => {
                        try {
                            return await this.handler.handleGetArtifacts({ 
                                channelId, 
                                threadId 
                            });
                        } catch (error) {
                            Logger.error('Error in getArtifacts:', error);
                            throw error;
                        }
                    },
                    getAllArtifacts: async () => {
                        try {
                            return await this.handler.handleGetAllArtifacts();
                        } catch (error) {
                            Logger.error('Error in getAllArtifacts:', error);
                            throw error;
                        }
                    },
                    deleteArtifact: async (artifactId) => {
                        try {
                            return await this.handler.handleDeleteArtifact(artifactId);
                        } catch (error) {
                            Logger.error('Error in deleteArtifact:', error);
                            throw error;
                        }
                    },
                    getLogs: async (logType) => {
                        try {
                            return await this.handler.handleGetLogs(logType);
                        } catch (error) {
                            Logger.error('Error in getLogs:', error);
                            throw error;
                        }
                    },
                    getHandles: async () => {
                        try {
                            return await this.handler.handleGetHandles();
                        } catch (error) {
                            Logger.error('Error in getHandles:', error);
                            throw error;
                        }
                    },
                    getSettings: async () => {
                        try {
                            return await this.handler.handleGetSettings();
                        } catch (error) {
                            Logger.error('Error in getSettings:', error);
                            throw error;
                        }
                    },
                    updateSettings: async (settings) => {
                        try {
                            return await this.handler.handleUpdateSettings(settings);
                        } catch (error) {
                            Logger.error('Error in updateSettings:', error);
                            throw error;
                        }
                    }
                },
                {
                    ...createSafeServerRPCHandlers(),
                    post: (data) => socket.emit('birpc', data),
                    on: (handler) => socket.on('birpc', handler)
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
