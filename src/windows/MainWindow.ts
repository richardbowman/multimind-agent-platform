import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import Logger from 'src/helpers/logger';
import { SettingsManager } from 'src/tools/settingsManager';

export class MainWindow {
    private window: BrowserWindow;
    private zoomLevel: number = 1.0;
    private infoEvent: (...args: any[]) => void;
    private settingsManager?: SettingsManager;

    constructor(
        initialZoom: number = 1.0, 
        width: number = 1200, 
        height: number = 800, 
        options?: Electron.BrowserWindowConstructorOptions,
        settingsManager?: SettingsManager
    ) {
        this.settingsManager = settingsManager;
        const isDev = !app.isPackaged;
        const iconPath = path.join(__dirname, isDev ? '../../assets/icon-dev.png' : '../assets/icon.png');

        this.window = new BrowserWindow({
            ...options,
            width: Math.round(width * this.zoomLevel),
            height: Math.round(height * this.zoomLevel),
            webPreferences: {
                preload: path.join(__dirname, './preload.js'),
                contextIsolation: true,
                nodeIntegration: false,
                zoomFactor: initialZoom
            },
            icon: iconPath,
            autoHideMenuBar: true,
            show: false
        });
        this.setZoomLevel(initialZoom);

        // Enable multithreading
        this.window.webContents.session.webRequest.onHeadersReceived((details, callback) => {
            if (details.responseHeaders) {
                details.responseHeaders['Cross-Origin-Opener-Policy'] = ['same-origin'];
                details.responseHeaders['Cross-Origin-Embedder-Policy'] = ['require-corp'];
            }
            callback({ responseHeaders: details.responseHeaders });
        });        

        // Setup window control handlers
        this.window.on('maximize', () => {
            this.window.webContents.send('window-state-changed', 'maximized');
        });

        this.window.on('unmaximize', () => {
            this.window.webContents.send('window-state-changed', 'normal');
        });

        this.infoEvent = this.onInfo.bind(this);
        Logger.on("_progress", this.infoEvent);
    }

    setZoomLevel(zoomLevel: number) {
        this.zoomLevel = Math.min(Math.max(zoomLevel, 0.5), 2.0); // Clamp between 0.5 and 2.0
        this.window.webContents.setZoomFactor(this.zoomLevel);
        this.window.webContents.setZoomLevel(1);    
    }

    getZoomLevel(): number {
        return this.zoomLevel;
    }

    private debounceResize = (() => {
        let timeout: NodeJS.Timeout;
        return () => {
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                const [width, height] = this.window.getSize();
                const unzoomedWidth = Math.round(width / this.zoomLevel);
                const unzoomedHeight = Math.round(height / this.zoomLevel);
                
                // Update settings
                if (this.settingsManager) {
                    this.settingsManager.updateSettings({
                        windowWidth: unzoomedWidth,
                        windowHeight: unzoomedHeight
                    });
                }

                this.window.webContents.send('save-window-size', { 
                    width: unzoomedWidth,
                    height: unzoomedHeight
                });
            }, 500); // 500ms debounce
        };
    })();

    async show() {
        // Save window size when resized with debounce
        this.window.on('resize', this.debounceResize);

        await this.window.loadFile(path.join(__dirname, './web/index.html'));
        //await this.window.loadURL('http://localhost:3000');

        this.window.show();
        this.window.webContents.setZoomFactor(1);
        this.window.webContents.setZoomLevel(this.zoomLevel);          
        if (this.settingsManager?.getSettings().openDevToolsOnLoad) {
            this.window.webContents.openDevTools();
        }
    }

    setMessage(message: string) {
        this.window.webContents.send('status', { message });
    }

    onInfo(logEntry) {
        this.window.webContents.send('status', logEntry);
    }

    getWindow(): BrowserWindow {
        return this.window;
    }

    close() {
        this.window.close();
        Logger.off("_progress", this.infoEvent);
    }
}
