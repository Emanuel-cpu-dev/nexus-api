const { app, BrowserWindow, ipcMain, shell, desktopCapturer } = require('electron');
const path = require('path');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1000,
    minHeight: 640,
    backgroundColor: '#0d0e14',
    title: 'Nexus',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, '..', 'app', 'dist', 'index.html'));
  } else {
    mainWindow.loadURL(process.env.NEXUS_DEV_URL || 'http://localhost:5173');
  }
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('get-sources', async () => {
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 240, height: 150 }
  });
  return sources.map((source) => ({ id: source.id, name: source.name }));
});

ipcMain.handle('open-external', async (event, url) => {
  if (!/^https?:\/\//i.test(String(url || ''))) return false;
  await shell.openExternal(url);
  return true;
});
