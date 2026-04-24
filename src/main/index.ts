import { app, BrowserWindow, desktopCapturer, session, shell } from 'electron';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import { join } from 'node:path';
import { registerIpcHandlers } from './ipc.js';
import { registerNotificationHandlers } from './notifications.js';
import { initTray } from './tray.js';
import { handleDeepLinkUrl, registerDeepLinkProtocol } from './deep-link.js';

let mainWindow: BrowserWindow | null = null;

function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#18181b',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

const singleInstanceLock = app.requestSingleInstanceLock();
if (!singleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
    const deepLinkArg = argv.find((a) => a.startsWith('matrix-client://'));
    if (deepLinkArg) handleDeepLinkUrl(deepLinkArg, mainWindow);
  });

  const pendingDeepLinks: string[] = [];
  app.on('open-url', (event, url) => {
    event.preventDefault();
    if (mainWindow) handleDeepLinkUrl(url, mainWindow);
    else pendingDeepLinks.push(url);
  });

  app.whenReady().then(() => {
    electronApp.setAppUserModelId('dev.matrix-client.app');

    app.on('browser-window-created', (_e, window) => {
      optimizer.watchWindowShortcuts(window);
    });

    // Wire getDisplayMedia for MatrixRTC screen sharing. Without a handler
    // Electron will reject the call; we hand back the first available source.
    // A richer picker can be added later by prompting the user in the renderer.
    session.defaultSession.setDisplayMediaRequestHandler(async (_req, callback) => {
      try {
        const sources = await desktopCapturer.getSources({
          types: ['screen', 'window'],
          fetchWindowIcons: false,
        });
        if (sources.length === 0) {
          callback({});
          return;
        }
        callback({ video: sources[0], audio: 'loopback' });
      } catch (err) {
        console.error('desktopCapturer failed:', err);
        callback({});
      }
    });

    registerDeepLinkProtocol();
    registerIpcHandlers();
    registerNotificationHandlers(getMainWindow);

    createWindow();

    mainWindow?.webContents.once('did-finish-load', () => {
      for (const url of pendingDeepLinks.splice(0)) {
        handleDeepLinkUrl(url, mainWindow);
      }
    });

    try {
      initTray(getMainWindow);
    } catch {
      // Tray is best-effort — on minimal Linux environments it may fail.
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
