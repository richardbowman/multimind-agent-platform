import io from 'socket.io-client';
import { createBirpc } from 'birpc';
import { BaseRPCService } from '../shared/BaseRPCService';
import type { ClientMethods, ServerMethods } from '../shared/RPCInterface';
import { createSafeRPCHandlers } from '../shared/rpcUtils';

export default class WebSocketService extends BaseRPCService {
  private socket: SocketIOClient.Socket | null = null;
  private isConnecting: boolean = false;

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
    
    if (this.socket || this.isConnecting) {
      console.debug('WebSocket: Already connected or connecting, skipping connection attempt');
      return; // Already connected or connecting
    }
    
    console.debug('WebSocket: Starting new connection');
    this.isConnecting = true;

    this.socket = io(url, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5
    });

    this.socket.once('connect', () => {
      this.isConnecting = false;
      console.log('Client: Successfully connected to WebSocket server');
      
      // Set up the real RPC instance once connected
      const safeHandlers = createSafeRPCHandlers();
      this.rpc = createBirpc<ServerMethods, ClientMethods>(
        {},
        {
          post: (data) => {
            return this.socket!.emit('birpc', data);
          },
          on: (handler) => {
            return this.socket!.on('birpc', handler);
          },
          serialize: safeHandlers.serialize,
          deserialize: safeHandlers.deserialize,
        }
      );

      // Initial data fetch - do this only once on connect
      Promise.all([
        this.getChannels(),
        this.getHandles()
      ]).catch(error => {
        console.error('Error fetching initial data:', error);
      });
    });
  }

  disconnect() {
    if (this.socket) {
      // Only disconnect if we're actually connected
      if (this.socket.connected) {
        this.socket.disconnect();
      }
      this.socket = null;
      this.isConnecting = false;
      // Reset to placeholder RPC
      this.setupPlaceholderRPC();
    }
  }
}
