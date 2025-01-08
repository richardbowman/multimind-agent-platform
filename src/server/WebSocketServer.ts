import { Server } from 'socket.io';
import { createServer } from 'http';
import express from 'express';
import { createBirpc } from 'birpc';
import { createSafeServerRPCHandlers } from './rpcUtils';
import Logger from '../helpers/logger';
import { trackPromise } from '../helpers/errorHandler';
import { HOST, PORT, PROTOCOL } from '../helpers/config';
import { MessageHandler } from './MessageHandler';
import { BackendServices } from '../types/BackendServices';
import { ClientMethods, ServerMethods } from 'src/web/client/src/shared/RPCInterface';
import { LLMLogEntry } from 'src/llm/LLMLogger';
import { ClientChannel, ClientMessage } from 'src/web/client/src/shared/IPCInterface';

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

        this.setupSocketHandlers(services);

        this.httpServer.listen(PORT, () => {
            Logger.info(`WebSocket server running on port ${PORT}`);
        });
    }

    private setupSocketHandlers(services: BackendServices) {
        this.io.on('connection', (socket) => {
            Logger.info('WebSocket: New client connection established');

            // Create birpc instance for this connection
            const rpc = createBirpc<ClientMethods, ServerMethods>(
                this.handler.createWrapper(),
                {
                    ...createSafeServerRPCHandlers(),
                    post: (data) => socket.emit('birpc', data),
                    on: (handler) => socket.on('birpc', handler)
                }
            );

            // Set up message receiving for the user client
            services.chatClient.receiveMessages((post: ChatPost) => {
                const rpcMessage = {
                    id: post.id,
                    channel_id: post.channel_id,
                    message: post.message,
                    user_id: post.user_id,
                    create_at: post.create_at,
                    directed_at: post.directed_at,
                    props: post.props,
                    thread_id: post.getRootId()
                };
                rpc.onMessage([rpcMessage]);
            });

            // Set up log update notifications
            services.llmLogger.on("log", (logEntry) => {
                rpc.onLogUpdate({
                    type: 'llm',
                    entry: logEntry
                });
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
}
