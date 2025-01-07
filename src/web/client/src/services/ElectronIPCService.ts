import { IIPCService, ClientMessage } from '../../../shared/IPCInterface';

export class ElectronIPCService implements IIPCService {
    constructor() {
        if (!(window as any).electron) {
            throw new Error('Electron IPC not available');
        }
    }

    connect(): void {
        // No-op for Electron
    }

    disconnect(): void {
        // No-op for Electron
    }

    // Handlers
    async sendMessage(message: Partial<ClientMessage>): Promise<void> {
        return (window as any).electron.sendMessage(message);
    }

    async getMessages(channelId: string, threadId: string | null): Promise<ClientMessage[]> {
        return (window as any).electron.getMessages(channelId, threadId);
    }

    async getChannels() {
        return (window as any).electron.getChannels();
    }

    async getTasks(channelId: string, threadId: string | null) {
        return (window as any).electron.getTasks(channelId, threadId);
    }

    async getArtifacts(channelId: string, threadId: string | null) {
        return (window as any).electron.getArtifacts(channelId, threadId);
    }

    async getAllArtifacts() {
        return (window as any).electron.getAllArtifacts();
    }

    async deleteArtifact(artifactId: string) {
        return (window as any).electron.deleteArtifact(artifactId);
    }

    async getSettings() {
        return (window as any).electron.getSettings();
    }

    async updateSettings(settings: any) {
        return (window as any).electron.updateSettings(settings);
    }

    async getLogs(logType: 'llm' | 'system' | 'api') {
        return (window as any).electron.getLogs(logType);
    }

    async getHandles() {
        return (window as any).electron.getHandles();
    }

    // Events
    onMessage(callback: (messages: ClientMessage[], isLive: boolean) => void) {
        return (window as any).electron.onMessage(callback);
    }

    onChannels(callback: (channels: any[]) => void) {
        return (window as any).electron.onChannels(callback);
    }

    onTasks(callback: (tasks: any[]) => void) {
        return (window as any).electron.onTasks(callback);
    }

    onArtifacts(callback: (artifacts: any[]) => void) {
        return (window as any).electron.onArtifacts(callback);
    }

    onLogs(callback: (logs: any) => void) {
        return (window as any).electron.onLogs(callback);
    }

    onHandles(callback: (handles: any[]) => void) {
        return (window as any).electron.onHandles(callback);
    }
}
