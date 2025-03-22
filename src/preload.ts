import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { BrowserElectron } from './browserExport';

const ElectronExport : BrowserElectron & { isDev: boolean } = {
    isDev: process.env.NODE_ENV === 'development',
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
    pathForFile: (file : File) => {
        return webUtils.getPathForFile(file)
    },
    posixPathForFile: (file : File) => {
        const path = webUtils.getPathForFile(file);
        // On Windows we get back a path with forward slashes.
        // Note that we don't have access to the path module in the preload script.
        return navigator.platform.toLowerCase().includes("win") ? path.split("\\").join("/") : path
    }
};

contextBridge.exposeInMainWorld("electron", ElectronExport);
