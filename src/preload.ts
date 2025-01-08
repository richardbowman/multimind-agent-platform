import { contextBridge, ipcRenderer } from 'electron';

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
        }
    }
);
