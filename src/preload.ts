import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld(
    'electron', {
        // birpc specific methods
        send: (channel: string, data: any) => {
            const validChannels = ['birpc', 'statusupdate'];
            if (validChannels.includes(channel)) {
                ipcRenderer.send(channel, data);
            }
        },
        receive: (channel: string, func: (...args: any[]) => void) => {
            const validChannels = ['birpc', 'statusupdate'];
            if (validChannels.includes(channel)) {
                ipcRenderer.on(channel, (event, ...args) => func(...args));
                return () => {
                    // ipcRenderer.removeListener(channel, func);
                };
            }
        },
        status: (func: (...args: any[]) => void) => {
            ipcRenderer.on("status", (event, ...args) => func(...args));
            return () => {
                ipcRenderer.removeListener("status", func);
            };
        },
    }
);


contextBridge.exposeInMainWorld(
    'electronAPI', {
        
    }
);
