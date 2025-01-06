require('./register-paths');

import { app, BrowserWindow } from 'electron';
import * as path from 'path';

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
    if (!app.isPackaged) {
      mainWindow?.loadURL('http://localhost:3000');
      mainWindow?.webContents.openDevTools();
    } else {
      const indexPath = path.join(process.resourcesPath, 'app.asar/web/client/build/index.html');
      console.log('Loading index from:', indexPath);
      mainWindow?.loadFile(indexPath);
    }
  } catch (err) {
    console.error('Failed to load app:', err);
    const fallbackPath = path.join(process.resourcesPath, 'app.asar/web/client/build/index.html');
    console.log('Trying fallback path:', fallbackPath);
    mainWindow?.loadFile(fallbackPath);
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
