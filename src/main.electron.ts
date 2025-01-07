import './register-paths';

import 'reflect-metadata';
import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import { initializeBackend } from './initializeBackend';
import Logger from './helpers/logger';

let mainWindow: BrowserWindow;
import { BackendServices } from './types/BackendServices';
import { MessageHandler } from './server/MessageHandler';

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

function setupIpcHandlers() {
    const handler = new MessageHandler(backendServices);

    // Messages
    ipcMain.handle('send-message', async (_, message) => {
        const result = await handler.handleSendMessage(message);
        mainWindow.webContents.send('message', [result], true);
        return result;
    });

    ipcMain.handle('get-messages', async (_, params) => {
        return handler.handleGetMessages(params);
    });

    // Channels
    ipcMain.handle('get-channels', async () => {
        return handler.handleGetChannels();
    });

    // Tasks
    ipcMain.handle('get-tasks', async (_, params) => {
        return handler.handleGetTasks(params);
    });

    // Artifacts
    ipcMain.handle('get-artifacts', async (_, params) => {
        return handler.handleGetArtifacts(params);
    });

    ipcMain.handle('get-all-artifacts', async () => {
        return handler.handleGetAllArtifacts();
    });

    ipcMain.handle('delete-artifact', async (_, artifactId) => {
        const artifacts = await handler.handleDeleteArtifact(artifactId);
        mainWindow.webContents.send('artifacts', artifacts);
        return artifacts;
    });

    // Settings
    ipcMain.handle('get-settings', async () => {
        return handler.handleGetSettings();
    });

    ipcMain.handle('update-settings', async (_, settings) => {
        return handler.handleUpdateSettings(settings);
    });

    // Logs
    ipcMain.handle('get-logs', async (_, logType) => {
        return handler.handleGetLogs(logType);
    });

    // Handles
    ipcMain.handle('get-handles', async () => {
        return handler.handleGetHandles();
    });
}

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
