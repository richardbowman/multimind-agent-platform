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
                preload: path.join(__dirname, '../preload.js'),
                backgroundThrottling: false // Prevent animations from stuttering
            }
        });
    }

    async show() {
        await this.window.loadFile(path.join(__dirname, '../web/splash.html'));
        // Wait for content to be fully rendered before showing window
        await new Promise<void>((resolve) => {
            this.window.webContents.on('did-finish-load', () => {
                // Add small delay to ensure rendering is complete
                setTimeout(() => {
                    this.window.show();
                    resolve();
                }, 100);
            });
        });
    }

    setMessage(message: string) {
        this.window.webContents.send('splash-message', message);
    }

    close() {
        this.window.close();
    }
}
