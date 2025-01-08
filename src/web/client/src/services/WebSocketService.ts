import io from 'socket.io-client';
import { createBirpc } from 'birpc';
import { BaseRPCService } from '../shared/BaseRPCService';
import type { ClientMethods, ServerMethods } from '../shared/RPCInterface';
import type { ClientMessage, IPCHandlers } from '../shared/IPCInterface';

export default class WebSocketService extends BaseRPCService {
  private socket: SocketIOClient.Socket | null = null;

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
      
      // Initialize birpc
      this.rpc = createBirpc<ServerMethods, ClientMethods>(this.clientMethods, {
        post: (data) => this.socket!.emit('birpc', data),
        on: (handler) => this.socket!.on('birpc', handler),
        serialize: JSON.stringify,
        deserialize: JSON.parse,
      });

      // Fetch initial data
      this.rpc.getChannels();
      this.rpc.getHandles();
    });
  }


  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

}
