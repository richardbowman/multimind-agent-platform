import './register-paths';

import 'reflect-metadata';

import { initializeConfig } from './helpers/config';
import { app, BrowserWindow } from 'electron';
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
            ...await initializeBackend(settingsManager),
            mainWindow
        };

        // Create main window
        splashWindow.setMessage('Loading main interface...');

        // Set up IPC handlers
        setupIpcHandlers();
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

export async function setupIpcHandlers(hasConfigError: boolean = false) {
    if (ipcServer) ipcServer.cleanup();

    ipcServer = new ElectronIPCServer(backendServices, mainWindow.getWindow(), hasConfigError);
    configComplete = !hasConfigError;

    mainWindow.getWindow().webContents.on('did-finish-load', () => {
        console.log('did finish load');
        if (ipcServer.getRPC()) {
            const status = {
                configured: configComplete,
                ready: configComplete,
                message: hasConfigError ? "Initial configuration required" : undefined
            };
            console.log('firing backend status', JSON.stringify(status, 2, false));
            ipcServer!.getRPC()!.onBackendStatus(status);
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
