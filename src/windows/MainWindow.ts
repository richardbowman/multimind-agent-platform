import { BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';

export class MainWindow {
    private window: BrowserWindow;
    private zoomLevel: number = 1.0;

    constructor(initialZoom: number = 1.0, options?: Electron.BrowserWindowConstructorOptions) {
        this.zoomLevel = initialZoom;
        this.window = new BrowserWindow({
            ...options,
            width: 1200,
            height: 800,
            webPreferences: {
                preload: path.join(__dirname, './preload.js'),
                contextIsolation: true,
                nodeIntegration: false
            },
            autoHideMenuBar: true,
            show: false
        });
        this.setZoomLevel(this.zoomLevel);
    }

    setZoomLevel(zoomLevel: number) {
        this.zoomLevel = Math.min(Math.max(zoomLevel, 0.5), 2.0); // Clamp between 0.5 and 2.0
        this.window.webContents.setZoomFactor(this.zoomLevel);
    }

    getZoomLevel(): number {
        return this.zoomLevel;
    }

    async show() {
        if (process.env.NODE_ENV === 'development') {
            await this.window.loadFile(path.join(__dirname, './web/index.html'));
            this.window.webContents.openDevTools();
        } else {
            await this.window.loadFile(path.join(__dirname, './web/index.html'));
        }
        this.window.show();
    }

    getWindow(): BrowserWindow {
        return this.window;
    }
}
