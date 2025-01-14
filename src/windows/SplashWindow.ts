import { app, BrowserWindow } from 'electron';
import * as path from 'path';

export class SplashWindow {
    private window: BrowserWindow;

    constructor() {
        this.window = new BrowserWindow({
            width: 400,
            height: 300,
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
                backgroundThrottling: false // Prevent animations from stuttering
            }
        });
    }

    async show() {
        await this.window.loadFile(path.join(__dirname, './web/splash.html'));
        this.window.show();
    }

    setMessage(message: string) {
        this.window.webContents.send('splash-message', message);
    }

    close() {
        this.window.close();
    }
}
