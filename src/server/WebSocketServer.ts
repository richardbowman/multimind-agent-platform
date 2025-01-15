import { Server } from 'socket.io';
import { createServer } from 'http';
import express from 'express';
import { createBirpc } from 'birpc';
import { createSafeServerRPCHandlers } from './rpcUtils';
import Logger from '../helpers/logger';
import { MessageHandler } from './MessageHandler';
import { BackendServices } from '../types/BackendServices';
import { ClientMethods, ServerMethods } from 'src/shared/RPCInterface';

export class WebSocketServer {
    private io: Server;
    private httpServer: ReturnType<typeof createServer>;
    private handler: MessageHandler;

    constructor(services: BackendServices, port?: number) {
        this.handler = new MessageHandler(services);
        const _s = services.settingsManager.getSettings();

        const app = express();
        this.httpServer = createServer(app);

        this.io = new Server(this.httpServer, {
            cors: {
                origin: `${_s.protocol}://${_s.host}:${_s.port}`,
                methods: ["GET", "POST"]
            }
        });

        this.setupSocketHandlers();

        this.httpServer.listen(_s.port, () => {
            Logger.info(`WebSocket server running on port ${_s.port}`);
        });
    }

    private setupSocketHandlers() {
        this.io.on('connection', (socket) => {
            Logger.info('WebSocket: New client connection established');

            // Add settings handlers
            const handlers = this.handler.createWrapper();

            // Create birpc instance for this connection
            const rpc = createBirpc<ClientMethods, ServerMethods>(
                handlers,
                {
                    ...createSafeServerRPCHandlers(),
                    post: (data) => socket.emit('birpc', data),
                    on: (handler) => socket.on('birpc', handler)
                }
            );

            this.handler.setupClientEvents(rpc)

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
