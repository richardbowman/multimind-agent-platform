import io from 'socket.io-client';
import { createBirpc } from 'birpc';
import { BaseRPCService } from '../../../../shared/BaseRPCService';
import type { ServerMethods } from '../../../../shared/RPCInterface';
import type { ClientMessage } from '../../../../shared/IPCInterface';

export default class WebSocketService extends BaseRPCService {
  private socket: SocketIOClient.Socket | null = null;

  // Add missing interface methods
  async getMessages(channelId: string, threadId: string | null): Promise<ClientMessage[]> {
    if (!this.socket) return [];
    return new Promise((resolve) => {
      this.socket!.once('messages', (messages: ClientMessage[]) => {
        this.messageHandlers.forEach(handler => handler(messages, false));
        resolve(messages);
      });
      this.socket!.emit('get_messages', { channel_id: channelId, thread_id: threadId });
    });
  }

  async getChannels(): Promise<ClientChannel[]> {
    if (!this.socket) return [];
    return new Promise((resolve) => {
      this.socket!.once('channels', (channels: ClientChannel[]) => {
        resolve(channels);
      });
      this.socket!.emit('get_channels');
    });
  }

  async getTasks(channelId: string, threadId: string | null): Promise<any[]> {
    if (!this.socket) return [];
    return new Promise((resolve) => {
      this.socket!.once('tasks', (tasks: any[]) => {
        resolve(tasks);
      });
      this.socket!.emit('get_tasks', { channel_id: channelId, thread_id: threadId });
    });
  }

  async getArtifacts(channelId: string, threadId: string | null): Promise<any[]> {
    if (!this.socket) return [];
    return new Promise((resolve) => {
      this.socket!.once('artifacts', (artifacts: any[]) => {
        resolve(artifacts);
      });
      this.socket!.emit('get_artifacts', { channel_id: channelId, thread_id: threadId });
    });
  }

  async getAllArtifacts(): Promise<any[]> {
    if (!this.socket) return [];
    return new Promise((resolve) => {
      this.socket!.once('artifacts', (artifacts: any[]) => {
        resolve(artifacts);
      });
      this.socket!.emit('get_all_artifacts');
    });
  }

  async getHandles(): Promise<Array<{id: string, handle: string}>> {
    if (!this.socket) return [];
    return new Promise((resolve) => {
      this.socket!.once('handles', (handles: Array<{id: string, handle: string}>) => {
        resolve(handles);
      });
      this.socket!.emit('get_handles');
    });
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
      
      // Initialize birpc
      this.rpc = createBirpc<ServerMethods>(this.clientMethods, {
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

  // Implement IIPCService methods using birpc
  async sendMessage(message: Partial<ClientMessage>) {
    return this.rpc.sendMessage(message);
  }

  async getMessages(channelId: string, threadId: string | null, limit: number = 50) {
    return this.rpc.getMessages({ channelId, threadId, limit });
  }

  async getChannels() {
    return this.rpc.getChannels();
  }

  async getTasks(channelId: string, threadId: string | null) {
    return this.rpc.getTasks({ channelId, threadId });
  }

  async getArtifacts(channelId: string, threadId: string | null) {
    return this.rpc.getArtifacts({ channelId, threadId });
  }

  async getAllArtifacts() {
    return this.rpc.getAllArtifacts();
  }

  async deleteArtifact(artifactId: string) {
    return this.rpc.deleteArtifact(artifactId);
  }

  async getSettings() {
    return this.rpc.getSettings();
  }

  async updateSettings(settings: any) {
    return this.rpc.updateSettings(settings);
  }

  async getLogs(logType: 'llm' | 'system' | 'api') {
    return this.rpc.getLogs(logType);
  }

  async getHandles() {
    return this.rpc.getHandles();
  }
}
