import { BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';

export class MainWindow {
    private window: BrowserWindow;

    constructor(hasConfigError: boolean = false) {
        this.window = new BrowserWindow({
            width: 1200,
            height: 800,
            webPreferences: {
                preload: path.join(__dirname, '../preload.js'),
                contextIsolation: true,
                nodeIntegration: false
            }
        });

        if (hasConfigError) {
            // Send message to renderer to show settings tab and disable others
            this.window.webContents.on('did-finish-load', () => {
                this.window.webContents.send('configuration-error');
            });
        }
    }

    async show() {
        if (process.env.NODE_ENV === 'development') {
            await this.window.loadURL('http://localhost:3000');
            this.window.webContents.openDevTools();
        } else {
            await this.window.loadFile(path.join(__dirname, '../web/index.html'));
        }
    }

    getWindow(): BrowserWindow {
        return this.window;
    }
}
