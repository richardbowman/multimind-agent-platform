import './register-paths';

import 'reflect-metadata';
import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import { initializeBackend } from './initializeBackend';
import Logger from './helpers/logger';
import { setupUnhandledRejectionHandler } from './helpers/errorHandler';

let mainWindow: BrowserWindow;
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
        // Initialize backend services
        backendServices = await initializeBackend();
        
        await createWindow();

        // Set up IPC handlers
        setupIpcHandlers();

    } catch (error) {
        Logger.error('Error in main:', error);
        process.exit(1);
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
