import { app, BrowserWindow, Menu, nativeImage, Tray, ipcMain } from 'electron';
import { join } from 'node:path';
import { IpcChannels } from '@shared/ipc-channels';

let tray: Tray | null = null;

export function initTray(getWindow: () => BrowserWindow | null): void {
  const iconPath = join(app.getAppPath(), 'resources', 'tray', 'icon.png');
  const image = nativeImage.createFromPath(iconPath);
  tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image);
  tray.setToolTip('Matrix Client');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: 'Show',
        click: () => {
          const win = getWindow();
          if (win) {
            win.show();
            win.focus();
          }
        },
      },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() },
    ]),
  );

  ipcMain.handle(IpcChannels.Window.SetBadgeCount, (_e, count: number) => {
    if (process.platform === 'darwin') {
      app.setBadgeCount(count);
    } else if (tray) {
      tray.setToolTip(count > 0 ? `Matrix Client — ${count} unread` : 'Matrix Client');
    }
  });
}
