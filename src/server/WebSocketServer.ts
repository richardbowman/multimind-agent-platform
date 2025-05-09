import { Server } from 'socket.io';
import { createServer } from 'http';
import express from 'express';
import { createBirpc } from 'birpc';
import { createSafeRPCHandlers } from '../types/rpcUtils';
import Logger from '../helpers/logger';
import { ServerRPCHandler } from './ServerRPCHandler';
import { BackendServices } from '../types/BackendServices';
import { ClientMethods, ServerMethods } from 'src/types/RPCInterface';
import { OllamaRouter } from './OllamaRouter';

export class WebSocketServer {
    private io: Server;
    private httpServer: ReturnType<typeof createServer>;
    private handler: ServerRPCHandler;

    constructor(services: BackendServices, port?: number) {
        this.handler = new ServerRPCHandler(services);
        const _s = services.settingsManager.getSettings();

        const app = express();
        app.use(express.json()); // Add JSON body parsing
        this.httpServer = createServer(app);

        // Add Ollama compatibility endpoint
        const ollamaRouter = new OllamaRouter(services);
        app.use('/ollama', ollamaRouter.getRouter());

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
                    ...createSafeRPCHandlers(Logger),
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
