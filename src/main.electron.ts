import './register-paths';

import 'reflect-metadata';
import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import { initializeBackend } from './initializeBackend';
import Logger from './helpers/logger';
import { setupUnhandledRejectionHandler } from './helpers/errorHandler';
import { SplashWindow } from './windows/SplashWindow';

let mainWindow: BrowserWindow;
let splashWindow: SplashWindow;
import { BackendServices } from './types/BackendServices';
import { ElectronIPCServer } from './server/ElectronIPCServer';

let backendServices: BackendServices;

async function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    // Load the React app
    if (process.env.NODE_ENV === 'development') {
        await mainWindow.loadURL('http://localhost:3000');
        mainWindow.webContents.openDevTools();
    } else {
        await mainWindow.loadFile(path.join(__dirname, 'web/client/build/index.html'));
    }
}

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
        await createWindow();

        // Set up IPC handlers
        setupIpcHandlers();

        // Close splash screen
        splashWindow.close();

    } catch (error) {
        Logger.error('Error in main:', error);
        if (splashWindow) {
            splashWindow.setMessage(`Error: ${error.message}`);
            // Keep splash window open for error display
            setTimeout(() => app.quit(), 5000);
        } else {
            process.exit(1);
        }
    }
});

let ipcServer: ElectronIPCServer;

function setupIpcHandlers() {
    ipcServer = new ElectronIPCServer(backendServices, mainWindow);
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
        createWindow();
    }
});
