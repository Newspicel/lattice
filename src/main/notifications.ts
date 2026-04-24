import { BrowserWindow, ipcMain, Notification } from 'electron';
import { IpcChannels } from '@shared/ipc-channels';
import type { NotificationPayload } from '@shared/types';

export function registerNotificationHandlers(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle(IpcChannels.Notifications.Show, (_e, payload: NotificationPayload) => {
    if (!Notification.isSupported()) return;
    const notification = new Notification({
      title: payload.title,
      body: payload.body,
      silent: false,
    });
    notification.on('click', () => {
      const win = getWindow();
      if (win) {
        if (win.isMinimized()) win.restore();
        win.focus();
        win.webContents.send(IpcChannels.Notifications.Clicked, payload);
      }
    });
    notification.show();
  });
}
