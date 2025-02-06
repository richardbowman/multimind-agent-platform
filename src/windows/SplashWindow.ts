import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import { electron } from 'process';
import Logger from 'src/helpers/logger';

export class SplashWindow {
    private window: BrowserWindow;
    private zoomLevel: number = 1.0;
    private infoEvent: (...args: any[]) => void;

    constructor(initialZoom: number = 1.0) {
        this.zoomLevel = initialZoom;
        this.window = new BrowserWindow({
            width: 500,
            height: 400,
            frame: false,
            transparent: true,
            resizable: false,
            skipTaskbar: true,
            autoHideMenuBar: true,
            hasShadow: true,
            show: false, // Don't show immediately
            webPreferences: {
                contextIsolation: true,
                nodeIntegration: false,
                preload: path.join(__dirname, './preload.js'),
                backgroundThrottling: false, // Prevent animations from stuttering
                zoomFactor: this.zoomLevel
            }
        });
        this.infoEvent = this.onInfo.bind(this);
        Logger.on("_progress", this.infoEvent);
    }

    async show() {
        await this.window.loadFile(path.join(__dirname, './web/splash.html'));
        this.window.webContents.setZoomFactor(this.zoomLevel);
        this.window.webContents.setZoomLevel(1);
        this.window.show();
    }

    setMessage(message: string) {
        try {
            this.window.webContents.send('status', { message });
        } catch (e) {
            Logger.error('failed trying to setmessage on splash', e);
        }
    }

    onInfo(logEntry) {
        try {
            this.window.webContents.send('status', logEntry);
        } catch (e) {
            Logger.error('failed trying to onInfo on splash', e);
        }
    }

    close() {
        this.window.close();
        Logger.off("_progress", this.infoEvent);
    }
}
