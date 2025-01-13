import { BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';

export class MainWindow {
    private window: BrowserWindow;

    constructor() {
        this.window = new BrowserWindow({
            width: 1200,
            height: 800,
            webPreferences: {
                preload: path.join(__dirname, '../preload.js'),
                contextIsolation: true,
                nodeIntegration: false
            },
            autoHideMenuBar: true,
            show: false
        });
    }

    async show() {
        if (process.env.NODE_ENV === 'development') {
            await this.window.loadFile(path.join(__dirname, '../web/index.html'));
            this.window.webContents.openDevTools();
        } else {
            await this.window.loadFile(path.join(__dirname, '../web/index.html'));
        }
        this.window.show();
    }

    getWindow(): BrowserWindow {
        return this.window;
    }
}
