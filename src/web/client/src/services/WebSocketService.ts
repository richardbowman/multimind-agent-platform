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
  reply_count: number;
  
  getRootId(): string | null;
  isReply(): boolean;
  hasUUID(): boolean;
  getActivityType(): string | null;
}

class WebSocketService {
  socket: SocketIOClient.Socket | null = null;
  private messageHandlers: ((messages: Message[]) => void)[] = [];
  private channelHandlers: ((channels: Channel[]) => void)[] = [];
  private threadHandlers: ((threads: Thread[]) => void)[] = [];
  private taskHandlers: ((tasks: any[]) => void)[] = [];
  private artifactHandlers: ((artifacts: any[]) => void)[] = [];

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
      // This is a live message
      this.messageHandlers.forEach(handler => handler([message], true));
    });

    this.socket.on('channels', (channels: Channel[]) => {
      this.channelHandlers.forEach(handler => handler(channels));
    });

    this.socket.on('threads', (threads: Thread[]) => {
      this.threadHandlers.forEach(handler => handler(threads));
    });

    this.socket.on('tasks', (tasks: any[]) => {
      console.log('Received tasks:', tasks);
      this.taskHandlers.forEach(handler => handler(tasks));
    });

    this.socket.on('artifacts', (artifacts: any[]) => {
      console.log('Received artifacts:', artifacts);
      this.artifactHandlers.forEach(handler => handler(artifacts));
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


  fetchMessages(channelId: string, threadId: string | null = null, limit: number = 50) {
    if (this.socket) {
      console.log('Fetching messages:', { channel_id: channelId, thread_id: threadId || '', limit });
      // Remove any existing messages handler to prevent duplicates
      this.socket.off('messages');
      // Add new handler
      this.socket.on('messages', (messages: Message[]) => {
        console.log('Received historical messages in service:', messages);
        // Don't trigger message handlers for historical messages
        this.messageHandlers.forEach(handler => handler(messages, false));
      });
      this.socket.emit('get_messages', { 
        channel_id: channelId, 
        thread_id: threadId || '', 
        limit 
      });
    }
  }

  on(event: string, handler: Function) {
    if (this.socket) {
      this.socket.on(event, handler);
    }
  }

  off(event: string, handler: Function) {
    if (this.socket) {
      this.socket.off(event, handler);
    }
  }

  onMessage(handler: (messages: Message[], isLive: boolean) => void) {
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

  onTasks(handler: (tasks: any[]) => void) {
    this.taskHandlers.push(handler);
    return () => {
      this.taskHandlers = this.taskHandlers.filter(h => h !== handler);
    };
  }

  onArtifacts(handler: (artifacts: any[]) => void) {
    this.artifactHandlers.push(handler);
    return () => {
      this.artifactHandlers = this.artifactHandlers.filter(h => h !== handler);
    };
  }

  fetchTasks(channelId: string, threadId: string | null) {
    if (this.socket) {
      this.socket.emit('get_tasks', { channel_id: channelId, thread_id: threadId });
    }
  }

  fetchArtifacts(channelId: string, threadId: string | null) {
    if (this.socket) {
      this.socket.emit('get_artifacts', { channel_id: channelId, thread_id: threadId });
    }
  }

  fetchAllArtifacts() {
    if (this.socket) {
      this.socket.emit('get_all_artifacts');
    }
  }

  fetchLogs() {
    if (this.socket) {
      this.socket.emit('get_logs');
    }
  }
}

export const webSocketService = new WebSocketService();
export default webSocketService;
