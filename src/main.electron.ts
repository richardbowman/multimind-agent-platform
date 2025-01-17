import './register-paths';

import 'reflect-metadata';

import { initializeConfig } from './helpers/config';
import { app, BrowserWindow, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';
import { initializeBackend } from './initializeBackend';
import Logger from './helpers/logger';
import { setupUnhandledRejectionHandler } from './helpers/errorHandler';
import { SplashWindow } from './windows/SplashWindow';
import { ConfigurationError } from './errors/ConfigurationError';
import { MainWindow } from './windows/MainWindow';
import { BackendServices, BackendServicesConfigNeeded, BackendServicesWithWindows } from './types/BackendServices';
import { ElectronIPCServer } from './server/ElectronIPCServer';
import { SettingsManager } from './tools/settingsManager';

let mainWindow: MainWindow;
let splashWindow: SplashWindow;
let settingsManager: SettingsManager;

export let backendServices: BackendServicesWithWindows|BackendServicesConfigNeeded;

// Configure autoUpdater
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.allowPrerelease = false;

// Set feed URL using your GitHub repository
autoUpdater.setFeedURL({
  provider: 'github',
  owner: 'richardbowman',
  repo: 'multi-agent'
});

// Check for updates
function checkForUpdates() {
  autoUpdater.checkForUpdates();
}

// Listen for update events
autoUpdater.on('checking-for-update', () => {
  mainWindow?.webContents.send('update-status', UpdateStatus.Checking);
});

autoUpdater.on('update-available', (info) => {
  mainWindow?.webContents.send('update-status', UpdateStatus.Available);
});

autoUpdater.on('update-not-available', () => {
  mainWindow?.webContents.send('update-status', UpdateStatus.NotAvailable);
});

autoUpdater.on('download-progress', (progress) => {
  mainWindow?.webContents.send('update-progress', progress);
});

autoUpdater.on('update-downloaded', () => {
  mainWindow?.webContents.send('update-status', UpdateStatus.Downloaded);
});

// IPC handlers
ipcMain.handle('check-for-updates', checkForUpdates);
ipcMain.handle('install-update', () => {
  autoUpdater.quitAndInstall();
});

// Set up global error handling
setupUnhandledRejectionHandler();

app.whenReady().then(async () => {
  // Check for updates after 5 seconds
  setTimeout(() => {
    checkForUpdates();
  }, 5000);
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
            ...await initializeBackend(settingsManager),
            mainWindow
        };

        // Create main window
        splashWindow.setMessage('Loading main interface...');

        // Set up IPC handlers with autoUpdater
        setupIpcHandlers(autoUpdater);
        await mainWindow.show();
        mainWindow.getWindow().on("close", shutdown);

        // Close splash screen
        splashWindow.close();

    } catch (error) {
        backendServices = {
            settingsManager,
            mainWindow
        };

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
        setupIpcHandlers(true);
        await mainWindow.show();
    }
});

let ipcServer: ElectronIPCServer;
let configComplete = false;

export async function setupIpcHandlers(autoUpdater: typeof import('electron-updater').autoUpdater, hasConfigError: boolean = false) {
    if (ipcServer) ipcServer.cleanup();

    ipcServer = new ElectronIPCServer(backendServices, mainWindow.getWindow(), hasConfigError, autoUpdater);
    configComplete = !hasConfigError;

    mainWindow.getWindow().webContents.on('dom-ready', () => {
        console.log('did finish load');
        if (ipcServer.getRPC()) {
            const status = {
                configured: configComplete,
                ready: configComplete,
                message: hasConfigError ? "Initial configuration required" : undefined
            };
            setTimeout(() => {
                console.log('firing backend status', JSON.stringify(status, 2, false));
                ipcServer!.getRPC()!.onBackendStatus(status);
            }, 500);
            
        }
    });

    console.log('setup ipc complete');
}

export async function reinitializeBackend() {
    const _s = settingsManager.getSettings();
    splashWindow = new SplashWindow(_s.zoom);

    backendServices = {
        ...await initializeBackend(settingsManager),
        mainWindow: mainWindow
    } as BackendServicesWithWindows;

    ipcServer.reinitialize(backendServices);
    configComplete = true;

    await splashWindow.close();
}

async function shutdown() {
    if (ipcServer) {
        ipcServer.cleanup();
    }
    if (backendServices.cleanup) await backendServices.cleanup();
    app.quit();
}

app.on('window-all-closed', shutdown);

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = new MainWindow();
        mainWindow.show();
    }
});
