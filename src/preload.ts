import { contextBridge, ipcRenderer } from 'electron';
import { ClientMessage } from './web/client/src/services/WebSocketService';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld(
    'electron', {
        // birpc specific methods
        send: (channel: string, data: any) => {
            const validChannels = ['birpc'];
            if (validChannels.includes(channel)) {
                ipcRenderer.send(channel, data);
            }
        },
        receive: (channel: string, func: (...args: any[]) => void) => {
            const validChannels = ['birpc'];
            if (validChannels.includes(channel)) {
                ipcRenderer.on(channel, (event, ...args) => func(...args));
                return () => {
                    ipcRenderer.removeListener(channel, func);
                };
            }
        },

        // Legacy methods
        sendMessage: (message: Partial<ClientMessage>) => 
            ipcRenderer.invoke('send-message', message),
        getMessages: (channelId: string, threadId: string | null) => 
            ipcRenderer.invoke('get-messages', { channelId, threadId }),
        onMessage: (callback: (messages: any[], isLive: boolean) => void) => {
            ipcRenderer.on('message', (_, ...args) => callback(...args));
            return () => {
                ipcRenderer.removeAllListeners('message');
            };
        },
        
        // Channels
        getChannels: () => ipcRenderer.invoke('get-channels'),
        onChannels: (callback: (channels: any[]) => void) => {
            ipcRenderer.on('channels', (_, channels) => callback(channels));
            return () => {
                ipcRenderer.removeAllListeners('channels');
            };
        },

        // Tasks
        getTasks: (channelId: string, threadId: string | null) => 
            ipcRenderer.invoke('get-tasks', { channelId, threadId }),
        onTasks: (callback: (tasks: any[]) => void) => {
            ipcRenderer.on('tasks', (_, tasks) => callback(tasks));
            return () => {
                ipcRenderer.removeAllListeners('tasks');
            };
        },

        // Artifacts
        getArtifacts: (channelId: string, threadId: string | null) => 
            ipcRenderer.invoke('get-artifacts', { channelId, threadId }),
        getAllArtifacts: () => ipcRenderer.invoke('get-all-artifacts'),
        deleteArtifact: (artifactId: string) => 
            ipcRenderer.invoke('delete-artifact', artifactId),
        onArtifacts: (callback: (artifacts: any[]) => void) => {
            ipcRenderer.on('artifacts', (_, artifacts) => callback(artifacts));
            return () => {
                ipcRenderer.removeAllListeners('artifacts');
            };
        },

        // Settings
        getSettings: () => ipcRenderer.invoke('get-settings'),
        updateSettings: (settings: any) => 
            ipcRenderer.invoke('update-settings', settings),

        // Logs
        getLogs: (logType: string) => ipcRenderer.invoke('get-logs', logType),
        onLogs: (callback: (logs: any) => void) => {
            ipcRenderer.on('logs', (_, logs) => callback(logs));
            return () => {
                ipcRenderer.removeAllListeners('logs');
            };
        },

        // Handles
        getHandles: () => ipcRenderer.invoke('get-handles'),
        onHandles: (callback: (handles: any[]) => void) => {
            ipcRenderer.on('handles', (_, handles) => callback(handles));
            return () => {
                ipcRenderer.removeAllListeners('handles');
            };
        }
    }
);
