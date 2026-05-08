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

const MATRIX_URL_FILTER = {
  urls: ['*://*/_matrix/*', '*://*/.well-known/matrix/*'],
};

// Some homeservers (and reverse proxies in front of them) don't return CORS
// headers, which breaks the renderer talking to them from the Vite dev origin
// (`http://localhost:5173`) — and from the packaged `file://` origin too once
// `webSecurity: true`. Inject permissive headers on Matrix responses, and
// short-circuit the preflight to a 200 so Chromium accepts the request.
function setupMatrixCorsBypass(): void {
  session.defaultSession.webRequest.onBeforeSendHeaders(
    MATRIX_URL_FILTER,
    (details, callback) => {
      const requestHeaders = { ...details.requestHeaders };
      // Strip the renderer's Origin so the homeserver — and any caching CDN —
      // can't pin the response to that single origin in `Access-Control-Allow-Origin`.
      delete requestHeaders.Origin;
      delete requestHeaders.origin;
      callback({ requestHeaders });
    },
  );

  session.defaultSession.webRequest.onHeadersReceived(
    MATRIX_URL_FILTER,
    (details, callback) => {
      const responseHeaders: Record<string, string[]> = {};
      for (const [key, value] of Object.entries(details.responseHeaders ?? {})) {
        // Drop existing CORS headers (any case) — we replace them wholesale.
        if (/^access-control-/i.test(key)) continue;
        responseHeaders[key] = Array.isArray(value) ? value : [value];
      }
      responseHeaders['Access-Control-Allow-Origin'] = ['*'];
      responseHeaders['Access-Control-Allow-Methods'] = [
        'GET, HEAD, POST, PUT, DELETE, OPTIONS',
      ];
      responseHeaders['Access-Control-Allow-Headers'] = [
        'Authorization, Content-Type, X-Requested-With',
      ];
      responseHeaders['Access-Control-Max-Age'] = ['86400'];

      // Some servers reply to OPTIONS with 401/403; rewrite to 200 so Chromium
      // accepts the preflight. Real (non-OPTIONS) status codes are left alone.
      const isPreflight = details.method === 'OPTIONS';
      const statusLine = isPreflight ? 'HTTP/1.1 200 OK' : details.statusLine;
      callback({ responseHeaders, statusLine });
    },
  );
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

    setupMatrixCorsBypass();

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
