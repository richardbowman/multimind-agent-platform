import './register-paths';

import 'reflect-metadata';
import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import { initializeBackend } from './initializeBackend';
import Logger from './helpers/logger';
import { setupUnhandledRejectionHandler } from './helpers/errorHandler';
import { SplashWindow } from './windows/SplashWindow';
import { ConfigurationError } from './errors/ConfigurationError';
import { MainWindow } from './windows/MainWindow';
let mainWindow: MainWindow;
let splashWindow: SplashWindow;
import { BackendServices } from './types/BackendServices';
import { ElectronIPCServer } from './server/ElectronIPCServer';

let backendServices: BackendServices;

// Set up global error handling
setupUnhandledRejectionHandler();

app.whenReady().then(async () => {
    try {
        // Show splash screen
        splashWindow = new SplashWindow();
        await splashWindow.show();

        // Initialize backend services
        splashWindow.setMessage('Initializing backend services...');
        backendServices = await initializeBackend({
            onProgress: (message) => splashWindow.setMessage(message)
        });
        
        // Create main window
        splashWindow.setMessage('Loading main interface...');
        mainWindow = new MainWindow();
        await mainWindow.show();

        // Set up IPC handlers
        setupIpcHandlers();

        // Close splash screen
        splashWindow.close();

    } catch (error) {
        Logger.error('Error in main:', error);
        if (error instanceof ConfigurationError) {
            // For configuration errors, show the main window with settings tab
            splashWindow.setMessage('Configuration needed...');
            mainWindow = new MainWindow();
            await mainWindow.show();
            setupIpcHandlers(true);
            splashWindow.close();
        } else {
            // For other errors, show error and quit
            if (splashWindow) {
                splashWindow.setMessage(`Error: ${error.message}`);
                setTimeout(() => app.quit(), 5000);
            } else {
                process.exit(1);
            }
        }
    }
});

let ipcServer: ElectronIPCServer;

function setupIpcHandlers(hasConfigError: boolean = false) {
    ipcServer = new ElectronIPCServer(backendServices, mainWindow.getWindow(), hasConfigError);
}

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        if (ipcServer) {
            ipcServer.cleanup();
        }
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = new MainWindow();
        mainWindow.show();
    }
});
