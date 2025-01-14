import { app, BrowserWindow } from 'electron';
import * as path from 'path';

export class SplashWindow {
    private window: BrowserWindow;
    private zoomLevel: number = 1.0;

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
    }

    setZoomLevel(zoomLevel: number) {
        // this.zoomLevel = Math.min(Math.max(zoomLevel, 0.5), 2.0); // Clamp between 0.5 and 2.0
        // this.window.webContents.setZoomFactor(this.zoomLevel);
    }

    getZoomLevel(): number {
        return this.zoomLevel;
    }

    async show() {
        await this.window.loadFile(path.join(__dirname, './web/splash.html'));
        this.window.show();
        this.window.webContents.setZoomFactor(this.zoomLevel);
        this.window.webContents.setZoomLevel(1);        
    }

    setMessage(message: string) {
        this.window.webContents.send('splash-message', message);
    }

    close() {
        this.window.close();
    }
}
