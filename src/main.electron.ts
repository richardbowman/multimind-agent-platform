require('./register-paths');

import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import isDev from 'electron-is-dev';

let mainWindow: BrowserWindow | null = null;

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  // Load the app
  try {
    if (isDev) {
      mainWindow?.loadURL('http://localhost:3000');
      mainWindow?.webContents.openDevTools();
    } else {
      mainWindow?.loadFile(path.join(__dirname, './src/web/client/build/index.html'));
    }
  } catch (err) {
    console.error('Failed to load app:', err);
    mainWindow?.loadFile(path.join(__dirname, './src/web/client/build/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// Start the backend server
async function startBackend() {
  try {
    const { initializeBackend } = await import('./main');
    const backend = await initializeBackend();
    return backend;
  } catch (err) {
    console.error('Failed to start backend:', err);
    throw err;
  }
}

startBackend().catch(err => {
  console.error('Fatal error starting backend:', err);
  app.quit();
});
