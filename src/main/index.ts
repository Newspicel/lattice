import { app, BrowserWindow, desktopCapturer, nativeTheme, session, shell } from 'electron';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import { join } from 'node:path';
import { registerIpcHandlers } from './ipc.js';
import { registerNotificationHandlers } from './notifications.js';
import { initTray } from './tray.js';
import { handleDeepLinkUrl, registerDeepLinkProtocol } from './deep-link.js';
import { initUpdater } from './updater.js';

// Dev-only: expose CDP on localhost so chrome-devtools-mcp can attach.
// Must be set before app is ready.
if (is.dev) {
  app.commandLine.appendSwitch('remote-debugging-port', '9222');
  app.commandLine.appendSwitch('remote-debugging-address', '127.0.0.1');
}

let mainWindow: BrowserWindow | null = null;

function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

// Keep these in sync with --color-bg in src/renderer/styles/global.css.
const BG_DARK = '#18181b';
const BG_LIGHT = '#ffffff';

function currentChromeBg(): string {
  return nativeTheme.shouldUseDarkColors ? BG_DARK : BG_LIGHT;
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
    ...(process.platform === 'darwin' && {
      trafficLightPosition: { x: 16, y: 14 },
    }),
    backgroundColor: currentChromeBg(),
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

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const current = mainWindow?.webContents.getURL();
    if (current && new URL(url).origin === new URL(current).origin) return;
    event.preventDefault();
    shell.openExternal(url);
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
    const deepLinkArg = argv.find((a) => a.startsWith('lattice://'));
    if (deepLinkArg) handleDeepLinkUrl(deepLinkArg, mainWindow);
  });

  const pendingDeepLinks: string[] = [];
  app.on('open-url', (event, url) => {
    event.preventDefault();
    if (mainWindow) handleDeepLinkUrl(url, mainWindow);
    else pendingDeepLinks.push(url);
  });

  app.whenReady().then(() => {
    electronApp.setAppUserModelId('dev.newspicel.lattice');

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
    initUpdater(getMainWindow).catch((err) => {
      console.error('Failed to initialize auto-updater:', err);
    });

    nativeTheme.on('updated', () => {
      mainWindow?.setBackgroundColor(currentChromeBg());
    });

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
