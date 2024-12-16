import io from 'socket.io-client';

export interface Channel {
  id: string;
  name: string;
  description?: string;
}

export interface Thread {
  rootMessage: Message;
  replies: Message[];
  last_message_at: number;
  channel_id: string;
}

export interface Message {
  id: string;
  channel_id: string;
  thread_id?: string;
  message: string;
  user_id: string;
  create_at: number;
  directed_at?: string;
  props?: Record<string, any>;
  
  getRootId(): string | null;
  isReply(): boolean;
  hasUUID(): boolean;
  getActivityType(): string | null;
}

class WebSocketService {
  socket: SocketIOClient.Socket | null = null;
  private messageHandlers: ((message: Message) => void)[] = [];
  private channelHandlers: ((channels: Channel[]) => void)[] = [];
  private threadHandlers: ((threads: Thread[]) => void)[] = [];

  connect(url: string = 'ws://localhost:4001') {
    this.socket = io(url, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5
    });

    this.socket.on('connect', () => {
      console.log('Connected to WebSocket server');
      // Fetch initial data upon connection
      this.fetchChannels();
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
      console.log('Fetching channels...');
      this.socket.emit('get_channels');
    } else {
      console.warn('Socket not connected while trying to fetch channels');
    }
  }

  fetchThreads(channelId: string) {
    if (this.socket) {
      this.socket.emit('get_threads', { channel_id: channelId });
    }
  }

  fetchThread(channelId: string, rootId: string) {
    if (this.socket) {
      this.socket.emit('get_thread', { channel_id: channelId, root_id: rootId });
    }
  }

  fetchMessages(channelId: string, threadId: string | null = null, limit: number = 50) {
    if (this.socket) {
      console.log('Fetching messages:', { channel_id: channelId, thread_id: threadId || '', limit });
      this.socket.emit('get_messages', { 
        channel_id: channelId, 
        thread_id: threadId || '', 
        limit 
      });
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
