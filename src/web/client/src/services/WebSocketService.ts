import io from 'socket.io-client';
import { createBirpc } from 'birpc';
import { BaseRPCService } from '../../../../types/BaseRPCService';
import type { ClientMethods, ServerMethods } from '../../../../types/RPCInterface';
import { createSafeRPCHandlers } from '../../../../types/rpcUtils';
import { Socket } from 'socket.io';
import { ClientLogger } from './ClientLogger';

export default class WebSocketService extends BaseRPCService {
  private socket: Socket | null = null;
  private isConnecting: boolean = false;

 constructor() {
    super();
    // Initialize with a placeholder RPC instance
    this.setupPlaceholderRPC();
  }

  // Implement EventEmitter methods
  emit(event: string | symbol, ...args: any[]): boolean {
    return this.eventEmitter.emit(event, ...args);
  }

  on(event: string | symbol, listener: (...args: any[]) => void): this {
    this.eventEmitter.on(event, listener);
    return this;
  }

  once(event: string | symbol, listener: (...args: any[]) => void): this {
    this.eventEmitter.once(event, listener);
    return this;
  }

  removeListener(event: string | symbol, listener: (...args: any[]) => void): this {
    this.eventEmitter.removeListener(event, listener);
    return this;
  }

  removeAllListeners(event?: string | symbol): this {
    this.eventEmitter.removeAllListeners(event);
    return this;
  }

  private setupPlaceholderRPC() {
    this.rpc = createBirpc<ServerMethods, ClientMethods>(
      createClientMethods({
        onMessage: () => {},
        onLogUpdate: () => {},
        onBackendStatus: () => {},
        onTaskUpdate: () => {}
      }, this.showSnackbar),
      {
        post: (data) => {
          const stack = new Error().stack;
          console.warn('Attempted RPC call before socket connected:', {
            data,
            stack: stack?.split('\n').slice(1).join('\n')  // Remove first line which is Error constructor
          });
        },
        on: () => () => {},
        serialize: JSON.stringify,
        deserialize: JSON.parse,
      }
    );
  }

  connect(url: string = typeof window !== 'undefined' && (window as any).electron
    ? 'ws://localhost:4001' : 'ws://localhost:4001') {
    
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
      const safeHandlers = createSafeRPCHandlers(ClientLogger);
      this.rpc = createBirpc<ServerMethods, ClientMethods>(
        createClientMethods(this.emit.bind(this), this.showSnackbar),
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
      }).then(() => {
        // Emit a connected event to trigger any necessary UI updates
        this.emit('connected');
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

