import './register-paths';

import 'reflect-metadata';
import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import fs from 'node:fs';
import { getDataPath } from './helpers/paths';

// Set app name based on environment
const isDev = !app.isPackaged;
const appName = isDev ? 'MultiMindDev' : 'MultiMind';
app.setName(appName);
const dataDir = getDataPath();
fs.mkdirSync(dataDir, { recursive: true });

import { initializeConfig } from './helpers/config';
import { initializeBackend } from './initializeBackend';
import Logger from './helpers/logger';
import { setupUnhandledRejectionHandler } from './helpers/errorHandler';
import { SplashWindow } from './windows/SplashWindow';
import { ConfigurationError } from './errors/ConfigurationError';
import { MainWindow } from './windows/MainWindow';
import { BackendServices, BackendServicesConfigNeeded, BackendServicesWithWindows } from './types/BackendServices';
import { ElectronIPCServer } from './server/ElectronIPCServer';
import { SettingsManager } from './tools/settingsManager';
import { LogReader } from './server/LogReader';
import { AppUpdater, autoUpdater } from 'electron-updater';
import { AsyncQueue } from './helpers/asyncQueue';

let mainWindow: MainWindow;
let splashWindow: SplashWindow;
let settingsManager: SettingsManager;

export let backendServices: BackendServicesWithWindows|BackendServicesConfigNeeded;

AsyncQueue.Logger = Logger;

// Configure autoUpdater
autoUpdater.logger = Logger;
autoUpdater.autoDownload = true;
autoUpdater.allowPrerelease = false;

// Set feed URL using your GitHub repository
autoUpdater.setFeedURL({
  provider: 'github',
  owner: 'richardbowman',
  repo: 'multimind-agent-platform'
});

// Check for updates
function checkForUpdates() {
    Logger.info("Checking for updates...");
    autoUpdater.checkForUpdates();
}

// IPC handlers
ipcMain.handle('check-for-updates', checkForUpdates);


// Set up global error handling
setupUnhandledRejectionHandler();



app.whenReady().then(async () => {
    try {

        settingsManager = await initializeConfig();
        const _s = settingsManager.getSettings();
        mainWindow = new MainWindow(_s.zoom, _s.windowWidth, _s.windowHeight, {
            frame: false
        }, settingsManager);

        // Show splash screen with zoom from settings
        splashWindow = new SplashWindow(_s.zoom);
        await splashWindow.show();

        // Initialize backend services
        splashWindow.setMessage('Initializing backend services...');
        backendServices = {
            type: "full",
            ...await initializeBackend(settingsManager),
            mainWindow,
            autoUpdater
        } as BackendServicesWithWindows;

        // Create main window
        splashWindow.setMessage('Loading main interface...');

        // Set up IPC handlers with autoUpdater
        setupIpcHandlers(autoUpdater, false);
        await mainWindow.show();
        mainWindow.getWindow().on("close", shutdown);

        // Close splash screen
        splashWindow.close();

        checkForUpdates();

    } catch (error: unknown) {
        backendServices = {
            type: "configNeeded",
            settingsManager,
            mainWindow,
            logReader: new LogReader(),
            error,
            autoUpdater
        } as BackendServicesConfigNeeded;

        Logger.error('Error in main:', error);
        if (error instanceof ConfigurationError) {
            // For configuration errors, show the main window with settings tab
            splashWindow.setMessage('Configuration needed...');
        } else {
            // For other errors, show error and quit
            if (splashWindow) {
                splashWindow.setMessage(`Error: ${error.message}`);
            } else {
                process.exit(1);
            }
        }

        splashWindow.close();
        setupIpcHandlers(autoUpdater, true);
        await mainWindow.show();
        mainWindow.getWindow().on("close", shutdown);

        checkForUpdates();
    }
});

let ipcServer: ElectronIPCServer;
let configComplete = false;

export async function setupIpcHandlers(autoUpdater: AppUpdater, hasConfigError: boolean = false) {
    if (ipcServer) ipcServer.cleanup();

    ipcServer = new ElectronIPCServer(backendServices, mainWindow.getWindow(), hasConfigError, autoUpdater);
    configComplete = !hasConfigError;

    mainWindow.getWindow().webContents.on('dom-ready', () => {
        console.log('did finish load');
        checkForUpdates();

        if (ipcServer.getRPC()) {
            const status = {
                configured: configComplete,
                ready: configComplete,
                message: hasConfigError ? "Initial configuration required" : undefined,
                appPath: app.getAppPath(),
                modelPath: path.join(getDataPath(), "models")
            };
            setTimeout(() => {
                console.log('firing backend status', JSON.stringify(status, 2, false));
                ipcServer!.getRPC()!.onBackendStatus(status);
            }, 500);
            
        }
    });

    console.log('setup ipc complete');
}

export async function reinitializeBackend() : Promise<BackendServicesConfigNeeded|BackendServicesWithWindows> {
    const _s = settingsManager.getSettings();
    splashWindow = new SplashWindow(_s.zoom);

    try {
        backendServices = {
            ...await initializeBackend(settingsManager),
            mainWindow: mainWindow,
            autoUpdater
        } as BackendServicesWithWindows;
        configComplete = true;
    } catch (err) {
        backendServices = {
            type: "configNeeded",
            settingsManager,
            mainWindow,
            logReader: new LogReader(),
            autoUpdater
        } as BackendServicesConfigNeeded;

        if (err instanceof ConfigurationError) {
            backendServices.error = err;
        }
        Logger.error("Error reinitializing", err);
        configComplete = false;
    }

    ipcServer.reinitialize(backendServices, autoUpdater);
    
    await splashWindow.close();

    return backendServices;
}

async function shutdown() {
    try {
        if (ipcServer) {
            ipcServer.cleanup();
        }
        
        // Handle cleanup for both service types
        if (backendServices.type === "full") {
            await backendServices.cleanup();
        } else {
            // For config-needed mode, just ensure proper cleanup
            if (backendServices.logReader) {
                backendServices.logReader.removeAllListeners();
            }
        }
    } catch (error) {
        Logger.error('Error during shutdown:', error);
    } finally {
        app.quit();
    }
}

app.on('window-all-closed', shutdown);

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = new MainWindow();
        mainWindow.show();
    }
});
