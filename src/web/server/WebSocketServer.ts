import { Server } from 'socket.io';
import { createServer } from 'http';
import express from 'express';
import { Channel, Thread, Message } from '../client/src/services/WebSocketService';

export class WebSocketServer {
    private io: Server;
    private channels: Channel[] = [
        { id: '1', name: 'General', description: 'General discussion' },
        { id: '2', name: 'Development', description: 'Development chat' }
    ];
    private threads: Record<string, Thread[]> = {};
    private messages: Message[] = [];

    constructor(port: number = 3001) {
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
            console.log(`WebSocket server running on port ${port}`);
        });
    }

    private setupSocketHandlers() {
        this.io.on('connection', (socket) => {
            console.log('Client connected');

            // Handle channel requests
            socket.on('get_channels', () => {
                socket.emit('channels', this.channels);
            });

            // Handle thread requests
            socket.on('get_threads', ({ channel_id }: { channel_id: string }) => {
                const channelThreads = this.threads[channel_id] || [];
                socket.emit('threads', channelThreads);
            });

            // Handle messages
            socket.on('message', (message: Partial<Message>) => {
                const fullMessage: Message = {
                    id: Date.now().toString(),
                    channel_id: message.channel_id!,
                    thread_id: message.thread_id,
                    message: message.message!,
                    user_id: message.user_id || 'anonymous',
                    create_at: Date.now(),
                    directed_at: message.directed_at
                };

                this.messages.push(fullMessage);
                this.io.emit('message', fullMessage);

                // If this is a threaded message, update the thread
                if (message.thread_id) {
                    this.updateThread(fullMessage);
                }
            });

            socket.on('disconnect', () => {
                console.log('Client disconnected');
            });
        });
    }

    private updateThread(message: Message) {
        if (!message.thread_id || !message.channel_id) return;

        const channelThreads = this.threads[message.channel_id] || [];
        const existingThread = channelThreads.find(t => t.id === message.thread_id);

        if (existingThread) {
            existingThread.last_message_at = message.create_at;
        } else {
            const newThread: Thread = {
                id: message.thread_id,
                channel_id: message.channel_id,
                title: message.message.substring(0, 50) + '...',
                last_message_at: message.create_at
            };
            this.threads[message.channel_id] = [...channelThreads, newThread];
            this.io.emit('threads', this.threads[message.channel_id]);
        }
    }
}
