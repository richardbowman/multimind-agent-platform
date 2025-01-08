import { BrowserWindow } from 'electron';
import * as path from 'path';

export class SplashWindow {
    private window: BrowserWindow;

    constructor() {
        this.window = new BrowserWindow({
            width: 400,
            height: 300,
            frame: false,
            transparent: true,
            webPreferences: {
                contextIsolation: true,
                nodeIntegration: false,
                preload: path.join(__dirname, '../preload.js')
            }
        });
    }

    async show() {
        if (process.env.NODE_ENV === 'development') {
            await this.window.loadFile(path.join(__dirname, '../web/client/public/splash.html'));
        } else {
            await this.window.loadFile(path.join(__dirname, 'web/client/build/splash.html'));
        }
    }

    setMessage(message: string) {
        this.window.webContents.send('splash-message', message);
    }

    close() {
        this.window.close();
    }
}
