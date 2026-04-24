import { app, BrowserWindow } from 'electron';
import { IpcChannels } from '@shared/ipc-channels';

const PROTOCOL = 'matrix-client';

export function registerDeepLinkProtocol(): void {
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [process.argv[1]]);
    }
  } else {
    app.setAsDefaultProtocolClient(PROTOCOL);
  }
}

export function handleDeepLinkUrl(url: string, mainWindow: BrowserWindow | null): void {
  if (!url.startsWith(`${PROTOCOL}://`)) return;
  try {
    const parsed = new URL(url);
    if (parsed.host === 'sso-callback') {
      const loginToken = parsed.searchParams.get('loginToken');
      if (loginToken && mainWindow) {
        mainWindow.webContents.send(IpcChannels.DeepLink.SsoCallback, { loginToken });
        if (!mainWindow.isFocused()) mainWindow.focus();
      }
    }
  } catch {
    // Ignore malformed deep links.
  }
}
