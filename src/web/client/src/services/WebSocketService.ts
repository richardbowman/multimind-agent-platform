import { io, Socket } from 'socket.io-client';

export interface Channel {
  id: string;
  name: string;
  description?: string;
}

export interface Thread {
  id: string;
  channel_id: string;
  title: string;
  last_message_at: number;
}

export interface Message {
  id: string;
  channel_id: string;
  thread_id?: string;
  message: string;
  user_id: string;
  create_at: number;
  directed_at?: string;
}

class WebSocketService {
  private socket: Socket | null = null;
  private messageHandlers: ((message: Message) => void)[] = [];
  private channelHandlers: ((channels: Channel[]) => void)[] = [];
  private threadHandlers: ((threads: Thread[]) => void)[] = [];

  connect(url: string = 'ws://localhost:3001') {
    this.socket = io(url);

    this.socket.on('connect', () => {
      console.log('Connected to WebSocket server');
    });

    this.socket.on('message', (message: Message) => {
      this.messageHandlers.forEach(handler => handler(message));
    });

    this.socket.on('channels', (channels: Channel[]) => {
      this.channelHandlers.forEach(handler => handler(channels));
    });

    this.socket.on('threads', (threads: Thread[]) => {
      this.threadHandlers.forEach(handler => handler(threads));
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

  fetchChannels() {
    if (this.socket) {
      this.socket.emit('get_channels');
    }
  }

  fetchThreads(channelId: string) {
    if (this.socket) {
      this.socket.emit('get_threads', { channel_id: channelId });
    }
  }

  onMessage(handler: (message: Message) => void) {
    this.messageHandlers.push(handler);
    return () => {
      this.messageHandlers = this.messageHandlers.filter(h => h !== handler);
    };
  }

  onChannels(handler: (channels: Channel[]) => void) {
    this.channelHandlers.push(handler);
    return () => {
      this.channelHandlers = this.channelHandlers.filter(h => h !== handler);
    };
  }

  onThreads(handler: (threads: Thread[]) => void) {
    this.threadHandlers.push(handler);
    return () => {
      this.threadHandlers = this.threadHandlers.filter(h => h !== handler);
    };
  }
}

export const webSocketService = new WebSocketService();
export default webSocketService;
