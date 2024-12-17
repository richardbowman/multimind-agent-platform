import io from 'socket.io-client';

export interface ClientChannel {
  id: string;
  name: string;
  description?: string;
}

export interface ClientThread {
  rootMessage: ClientMessage;
  replies: ClientMessage[];
  last_message_at: number;
  channel_id: string;
}

export interface ClientMessage {
  id: string;
  channel_id: string;
  thread_id?: string;
  message: string;
  user_id: string;
  create_at: number;
  directed_at?: string;
  props?: Record<string, any>;
  inProgress?: boolean;
  reply_count: number;
  
  getRootId(): string | null;
  isReply(): boolean;
  hasUUID(): boolean;
  getActivityType(): string | null;
}

class WebSocketService {
  socket: SocketIOClient.Socket | null = null;
  private messageHandlers: ((messages: ClientMessage[], isLive: boolean) => void)[] = [];
  private channelHandlers: ((channels: ClientChannel[]) => void)[] = [];
  private threadHandlers: ((threads: ClientThread[]) => void)[] = [];
  private taskHandlers: ((tasks: any[]) => void)[] = [];
  private artifactHandlers: ((artifacts: any[]) => void)[] = [];
  private handleHandlers: ((handles: {id: string, handle: string}[]) => void)[] = [];
  private logHandlers: ((logs: { type: string, data: any }) => void)[] = [];

  connect(url: string = 'ws://localhost:4001') {
    // Clean up any existing socket connection
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
    }

    this.socket = io(url, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5
    });

    // Set up connect handler only once
    this.socket.once('connect', () => {
      console.log('Connected to WebSocket server');

      this.socket!.removeAllListeners();
  
      // Fetch initial data upon connection
      this.fetchChannels();
      this.fetchHandles();
      
      // Set up system log listener
      this.socket!.on('system_log', (logEntry: any) => {
        this.socket!.emit('logs', {
          type: 'system',
          data: [logEntry]
        });
      });

      this.socket!.on('message', (message: ClientMessage) => {
        // This is a live message
        console.log('receiving message', message);
        
        if (message.thread_id) {
          // This is a reply - update the parent message's reply count
          this.messageHandlers.forEach(handler => {
            handler([message], true);
            // Create an updated version of the parent message with incremented reply_count
            const parentMessage = this.socket!.emit('get_message', message.thread_id);
          });
        } else {
          this.messageHandlers.forEach(handler => handler([message], true));
        }
      });
  
      this.socket!.on('channels', (channels: ClientChannel[]) => {
        this.channelHandlers.forEach(handler => handler(channels));
      });
  
      this.socket!.on('threads', (threads: ClientThread[]) => {
        this.threadHandlers.forEach(handler => handler(threads));
      });
  
      this.socket!.on('tasks', (tasks: any[]) => {
        console.log('Received tasks:', tasks);
        this.taskHandlers.forEach(handler => handler(tasks));
      });
  
      this.socket!.on('artifacts', (artifacts: any[]) => {
        console.log('Received artifacts:', artifacts);
        this.artifactHandlers.forEach(handler => handler(artifacts));
      });
  
      this.socket!.on('logs', (newLogs: { type: string, data: any }) => {
        if (!newLogs?.type || !['llm', 'system', 'api'].includes(newLogs.type)) {
          console.warn('WebSocketService: Received unknown log type:', newLogs?.type);
          return;
        }
        console.log('WebSocketService: Received logs:', newLogs);
        this.logHandlers.forEach(handler => handler(newLogs));
      });
  
      this.socket!.on('disconnect', () => {
        console.log('Disconnected from WebSocket server');
      });
  
      this.socket!.on('error', (error: Error) => {
        console.error('WebSocket error:', error);
      });
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  sendMessage(message: Partial<ClientMessage>) {
    if (this.socket) {
      this.socket.emit('send_message', message);
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
      this.socket.on('messages', (messages: ClientMessage[]) => {
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

  onMessage(handler: (messages: ClientMessage[], isLive: boolean) => void) {
    this.messageHandlers.push(handler);
    return () => {
      this.messageHandlers = this.messageHandlers.filter(h => h !== handler);
    };
  }

  onChannels(handler: (channels: ClientChannel[]) => void) {
    this.channelHandlers.push(handler);
    return () => {
      this.channelHandlers = this.channelHandlers.filter(h => h !== handler);
    };
  }

  onThreads(handler: (threads: ClientThread[]) => void) {
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

  fetchHandles() {
    if (this.socket) {
      this.socket.emit('get_handles');
    }
  }

  onHandles(handler: (handles: Array<{id: string, handle: string}>) => void) {
    this.handleHandlers.push(handler);
    if (this.socket) {
      this.socket.on('handles', handler);
    }
    return () => {
      this.handleHandlers = this.handleHandlers.filter(h => h !== handler);
      if (this.socket) {
        this.socket.off('handles', handler);
      }
    };
  }

  fetchLogs(logType: 'llm' | 'system' | 'api') {
    if (!this.socket) {
      console.warn('Socket not connected while trying to fetch logs');
      return;
    }
    if (!['llm', 'system', 'api'].includes(logType)) {
      console.error('Invalid log type:', logType);
      return;
    }
    console.log('WebSocketService: Fetching logs for type:', logType);
    this.socket.emit('get_logs', logType);
  }

  onLogs(handler: (logs: { type: string, data: any }) => void) {
    this.logHandlers.push(handler);
    return () => {
      this.logHandlers = this.logHandlers.filter(h => h !== handler);
    };
  }
}

export const webSocketService = new WebSocketService();
export default webSocketService;
