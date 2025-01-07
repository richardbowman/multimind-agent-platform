import 'reflect-metadata';
import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import { initializeBackend } from './initializeBackend';
import Logger from './helpers/logger';

let mainWindow: BrowserWindow;
let backendServices: any;

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
        await mainWindow.loadFile(path.join(__dirname, '../build/index.html'));
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
    // Messages
    ipcMain.handle('send-message', async (_, message) => {
        const result = await backendServices.chatClient.postInChannel(
            message.channel_id,
            message.message,
            message.props
        );
        mainWindow.webContents.send('message', [result], true);
        return result;
    });

    ipcMain.handle('get-messages', async (_, { channelId, threadId }) => {
        const messages = await backendServices.chatClient.fetchPreviousMessages(channelId);
        return messages;
    });

    // Channels
    ipcMain.handle('get-channels', async () => {
        return backendServices.chatClient.getChannels();
    });

    // Tasks
    ipcMain.handle('get-tasks', async (_, { channelId, threadId }) => {
        return backendServices.taskManager.getTasks(channelId, threadId);
    });

    // Artifacts
    ipcMain.handle('get-artifacts', async (_, { channelId, threadId }) => {
        return backendServices.artifactManager.getArtifacts(channelId, threadId);
    });

    ipcMain.handle('get-all-artifacts', async () => {
        return backendServices.artifactManager.listArtifacts();
    });

    ipcMain.handle('delete-artifact', async (_, artifactId) => {
        await backendServices.artifactManager.deleteArtifact(artifactId);
        const artifacts = await backendServices.artifactManager.listArtifacts();
        mainWindow.webContents.send('artifacts', artifacts);
    });

    // Settings
    ipcMain.handle('get-settings', async () => {
        return backendServices.settings;
    });

    ipcMain.handle('update-settings', async (_, settings) => {
        backendServices.settings = { ...backendServices.settings, ...settings };
        return backendServices.settings;
    });

    // Logs
    ipcMain.handle('get-logs', async (_, logType) => {
        switch (logType) {
            case 'llm':
                return backendServices.llmLogger.getAllLogs();
            case 'system':
                return backendServices.logReader.readLogs();
            case 'api':
                return []; // TODO: Implement API logs
            default:
                return [];
        }
    });

    // Handles
    ipcMain.handle('get-handles', async () => {
        return backendServices.chatClient.getHandles();
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
