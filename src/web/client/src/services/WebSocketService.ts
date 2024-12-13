import { Socket } from 'socket.io-client';
import io from 'socket.io-client';

export interface Message {
  id: string;
  channel_id: string;
  message: string;
  user_id: string;
  create_at: number;
  directed_at?: string;
}

class WebSocketService {
  private socket: Socket | null = null;
  private messageHandlers: ((message: Message) => void)[] = [];

  connect(url: string = 'ws://localhost:3001') {
    this.socket = io(url);

    this.socket.on('connect', () => {
      console.log('Connected to WebSocket server');
    });

    this.socket.on('message', (message: Message) => {
      this.messageHandlers.forEach(handler => handler(message));
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from WebSocket server');
    });

    this.socket.on('error', (error: Error) => {
      console.error('WebSocket error:', error);
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  sendMessage(message: Partial<Message>) {
    if (this.socket) {
      this.socket.emit('message', message);
    }
  }

  onMessage(handler: (message: Message) => void) {
    this.messageHandlers.push(handler);
    return () => {
      this.messageHandlers = this.messageHandlers.filter(h => h !== handler);
    };
  }
}

export const webSocketService = new WebSocketService();
export default webSocketService;
