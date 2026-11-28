const { app, BrowserWindow, dialog, ipcMain, shell, desktopCapturer } = require('electron');
const fs = require('node:fs');
const path = require('path');

// La interfaz se sirve desde Render: así cualquier cambio llega sin reenviar el .exe.
// REBUILD-CON-URL.ps1 actualiza esta constante si la URL pública cambiara.
const REMOTE_UI_URL = 'https://nexus-api-cdxi.onrender.com/';

let mainWindow = null;
let shortcutChecked = false;

// En Windows la barra de tareas toma el icono de la ventana y el AppUserModelId.
// Sin esto, Windows muestra el icono genérico de Electron.
if (process.platform === 'win32') app.setAppUserModelId('com.proyecto.nexus');

function shortcutPath() {
  try {
    return path.join(app.getPath('desktop'), 'Heph.lnk');
  } catch {
    return '';
  }
}

function askedFlagPath() {
  return path.join(app.getPath('userData'), 'heph-shortcut-asked.json');
}

async function maybeAskShortcut() {
  if (shortcutChecked || process.platform !== 'win32' || !app.isPackaged) return;
  shortcutChecked = true;

  const link = shortcutPath();
  if (!link || fs.existsSync(link)) return;

  let alreadyAsked = false;
  try {
    alreadyAsked = JSON.parse(fs.readFileSync(askedFlagPath(), 'utf8'))?.asked === true;
  } catch {
    /* Primera vez o archivo viejo: se pregunta. */
  }
  if (alreadyAsked) return;
  const markAsked = () => {
    try {
      fs.mkdirSync(app.getPath('userData'), { recursive: true });
      fs.writeFileSync(askedFlagPath(), JSON.stringify({ asked: true }), 'utf8');
    } catch {
      /* Si no se puede guardar, simplemente se vuelve a preguntar. */
    }
  };

  // En el portable, process.execPath apunta al temporal extraído. Esta variable
  // la pone electron-builder y apunta al Nexus-Portable.exe que el usuario ejecutó.
  const portable = process.env.PORTABLE_EXECUTABLE_FILE;
  const target = portable && fs.existsSync(portable) ? portable : process.execPath;

  const answer = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    buttons: ['Crear acceso directo', 'Ahora no'],
    defaultId: 0,
    cancelId: 1,
    title: 'Heph',
    message: '¿Querés crear un acceso directo de Heph en el escritorio?',
    detail: 'Así abrís Heph sin buscar el ejecutable. Podés borrarlo cuando quieras.'
  });
  if (answer.response !== 0) {
    markAsked();
    return;
  }

  try {
    const created = shell.writeShortcutLink(link, 'create', {
      target,
      cwd: path.dirname(target),
      args: '',
      description: 'Heph · conectados',
      icon: target,
      iconIndex: 0,
      appUserModelId: 'com.proyecto.nexus'
    });
    if (!created) throw new Error('Windows no pudo crear el acceso directo.');
    markAsked();
  } catch (error) {
    dialog.showMessageBox(mainWindow, {
      type: 'error',
      title: 'Heph',
      message: 'No se pudo crear el acceso directo.',
      detail: error.message
    });
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1000,
    minHeight: 640,
    backgroundColor: '#0d0e14',
    title: 'Heph',
    icon: path.join(__dirname, '..', 'heph.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  const askShortcut = () => {
    if (mainWindow && !mainWindow.isDestroyed()) maybeAskShortcut().catch(() => {});
  };
  // ready-to-show no siempre llega cuando la ventana ya se muestra: usamos
  // did-finish-load y un respaldo por tiempo para que el cartel aparezca igual.
  mainWindow.webContents.once('did-finish-load', askShortcut);
  setTimeout(askShortcut, 2500);

  if (app.isPackaged) {
    const localIndex = path.join(__dirname, '..', 'app', 'dist', 'index.html');
    mainWindow
      .loadURL(process.env.NEXUS_UI_URL || REMOTE_UI_URL)
      .catch(() => mainWindow.loadFile(localIndex));
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
