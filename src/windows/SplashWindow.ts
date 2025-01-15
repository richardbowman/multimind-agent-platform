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
            width: 400*initialZoom,
            height: 300*initialZoom,
            frame: false,
            transparent: true,
            resizable: false,
            skipTaskbar: true,
            autoHideMenuBar: true,
            hasShadow: false,
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
        this.window.show();
        this.window.webContents.setZoomFactor(this.zoomLevel);
        this.window.webContents.setZoomLevel(1);
    }

    setMessage(message: any) {
        if (!this.window.isDestroyed) {
            this.window.webContents.send('status', message);
        }
    }

    onInfo(logEntry) {
        this.setMessage(logEntry);
    }

    close() {
        this.window.close();
        Logger.off("_progress", this.infoEvent);
    }
}
