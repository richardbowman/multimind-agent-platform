import io from 'socket.io-client';
import { createBirpc } from 'birpc';
import { BaseRPCService } from '../shared/BaseRPCService';
import type { ClientMethods, ServerMethods } from '../shared/RPCInterface';

export default class WebSocketService extends BaseRPCService {
  private socket: SocketIOClient.Socket | null = null;

  constructor() {
    super();
    // Initialize with a placeholder RPC instance
    this.setupPlaceholderRPC();
  }

  private setupPlaceholderRPC() {
    this.rpc = createBirpc<ServerMethods, ClientMethods>(
      {},
      {
        post: () => console.warn('Socket not connected'),
        on: () => () => {},
        serialize: JSON.stringify,
        deserialize: JSON.parse,
      }
    );
  }

  connect(url: string = typeof window !== 'undefined' && (window as any).electron
    ? 'ws://localhost:4001'
    : process.env.REACT_APP_WS_URL || 'ws://localhost:4001') {
    
    if (this.socket) {
      this.socket.disconnect();
    }

    this.socket = io(url, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5
    });

    this.socket.once('connect', () => {
      console.log('Connected to WebSocket server');
      
      // Set up the real RPC instance once connected
      this.rpc = createBirpc<ServerMethods, ClientMethods>(
        {},
        {
          post: (data) => this.socket!.emit('birpc', data),
          on: (handler) => this.socket!.on('birpc', handler),
          serialize: JSON.stringify,
          deserialize: JSON.parse,
        }
      );

      // Fetch initial data
      this.getChannels();
      this.getHandles();
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      // Reset to placeholder RPC
      this.setupPlaceholderRPC();
    }
  }
}
