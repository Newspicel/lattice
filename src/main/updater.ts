import { app, BrowserWindow, ipcMain } from 'electron';
import electronUpdater from 'electron-updater';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { IpcChannels } from '@shared/ipc-channels';
import type { UpdateChannel, UpdateState } from '@shared/types';

const { autoUpdater } = electronUpdater;

const UPDATE_CONFIG_FILE = 'update-config.json';
const INITIAL_CHECK_DELAY_MS = 8000;

interface PersistedConfig {
  channel: UpdateChannel;
}

function configPath(): string {
  return join(app.getPath('userData'), UPDATE_CONFIG_FILE);
}

async function readConfig(): Promise<PersistedConfig> {
  try {
    const raw = await fs.readFile(configPath(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<PersistedConfig>;
    return { channel: parsed.channel === 'nightly' ? 'nightly' : 'stable' };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { channel: 'stable' };
    throw err;
  }
}

async function writeConfig(config: PersistedConfig): Promise<void> {
  await fs.writeFile(configPath(), JSON.stringify(config, null, 2), 'utf8');
}

let currentChannel: UpdateChannel = 'stable';
let lastState: UpdateState = {
  status: 'idle',
  channel: 'stable',
  version: app.getVersion(),
};

function broadcast(getWindow: () => BrowserWindow | null, partial: Omit<UpdateState, 'channel' | 'version'>): void {
  lastState = {
    ...partial,
    channel: currentChannel,
    version: app.getVersion(),
  };
  const win = getWindow();
  if (!win || win.isDestroyed()) return;
  win.webContents.send(IpcChannels.Updates.StateChanged, lastState);
}

function applyChannel(channel: UpdateChannel): void {
  // electron-updater picks {channel}-{platform}.yml from the GitHub release.
  // Nightly builds are tagged as prerelease; allowPrerelease unlocks them.
  if (channel === 'nightly') {
    autoUpdater.channel = 'nightly';
    autoUpdater.allowPrerelease = true;
  } else {
    autoUpdater.channel = 'latest';
    autoUpdater.allowPrerelease = false;
  }
}

export async function initUpdater(getWindow: () => BrowserWindow | null): Promise<void> {
  const config = await readConfig();
  currentChannel = config.channel;
  lastState = { status: 'idle', channel: currentChannel, version: app.getVersion() };

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  // Allow falling back to an older stable build when switching off nightly.
  autoUpdater.allowDowngrade = true;
  applyChannel(currentChannel);

  autoUpdater.on('checking-for-update', () => {
    broadcast(getWindow, { status: 'checking' });
  });
  autoUpdater.on('update-available', (info) => {
    broadcast(getWindow, { status: 'available', availableVersion: info.version });
  });
  autoUpdater.on('update-not-available', (info) => {
    broadcast(getWindow, { status: 'up-to-date', availableVersion: info.version });
  });
  autoUpdater.on('download-progress', (progress) => {
    broadcast(getWindow, {
      status: 'downloading',
      progress: {
        percent: progress.percent,
        transferred: progress.transferred,
        total: progress.total,
        bytesPerSecond: progress.bytesPerSecond,
      },
    });
  });
  autoUpdater.on('update-downloaded', (info) => {
    broadcast(getWindow, { status: 'downloaded', availableVersion: info.version });
  });
  autoUpdater.on('error', (err) => {
    broadcast(getWindow, { status: 'error', error: err.message });
  });

  ipcMain.handle(IpcChannels.Updates.GetState, () => lastState);
  ipcMain.handle(IpcChannels.Updates.GetChannel, () => currentChannel);

  ipcMain.handle(IpcChannels.Updates.SetChannel, async (_e, channel: UpdateChannel) => {
    if (channel !== 'stable' && channel !== 'nightly') return currentChannel;
    if (channel === currentChannel) return currentChannel;
    currentChannel = channel;
    applyChannel(channel);
    await writeConfig({ channel });
    broadcast(getWindow, { status: 'idle' });
    if (app.isPackaged) {
      autoUpdater.checkForUpdates().catch((err: Error) => {
        broadcast(getWindow, { status: 'error', error: err.message });
      });
    }
    return currentChannel;
  });

  ipcMain.handle(IpcChannels.Updates.Check, async () => {
    if (!app.isPackaged) {
      broadcast(getWindow, {
        status: 'unsupported',
        error: 'Updates are only delivered in packaged builds.',
      });
      return lastState;
    }
    try {
      await autoUpdater.checkForUpdates();
    } catch (err) {
      broadcast(getWindow, { status: 'error', error: (err as Error).message });
    }
    return lastState;
  });

  ipcMain.handle(IpcChannels.Updates.QuitAndInstall, () => {
    if (!app.isPackaged) return;
    autoUpdater.quitAndInstall();
  });

  if (app.isPackaged) {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch((err: Error) => {
        broadcast(getWindow, { status: 'error', error: err.message });
      });
    }, INITIAL_CHECK_DELAY_MS);
  } else {
    broadcast(getWindow, {
      status: 'unsupported',
      error: 'Updates are only delivered in packaged builds.',
    });
  }
}
