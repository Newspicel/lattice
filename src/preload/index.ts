import { contextBridge, ipcRenderer } from 'electron';
import { electronAPI } from '@electron-toolkit/preload';
import { IpcChannels } from '../shared/ipc-channels.js';
import type { AccountMetadata, NotificationPayload } from '../shared/types.js';

const nativeApi = {
  platform: process.platform,

  secrets: {
    get: (key: string): Promise<string | null> =>
      ipcRenderer.invoke(IpcChannels.Secrets.Get, key),
    set: (key: string, value: string): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.Secrets.Set, key, value),
    delete: (key: string): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.Secrets.Delete, key),
  },

  accounts: {
    list: (): Promise<AccountMetadata[]> =>
      ipcRenderer.invoke(IpcChannels.Accounts.ListMetadata),
    upsert: (account: AccountMetadata): Promise<AccountMetadata[]> =>
      ipcRenderer.invoke(IpcChannels.Accounts.UpsertMetadata, account),
    delete: (id: string): Promise<AccountMetadata[]> =>
      ipcRenderer.invoke(IpcChannels.Accounts.DeleteMetadata, id),
  },

  notifications: {
    show: (payload: NotificationPayload): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.Notifications.Show, payload),
    onClicked: (cb: (payload: NotificationPayload) => void): (() => void) => {
      const listener = (_e: Electron.IpcRendererEvent, payload: NotificationPayload) =>
        cb(payload);
      ipcRenderer.on(IpcChannels.Notifications.Clicked, listener);
      return () => ipcRenderer.off(IpcChannels.Notifications.Clicked, listener);
    },
  },

  window: {
    setBadgeCount: (count: number): Promise<void> =>
      ipcRenderer.invoke(IpcChannels.Window.SetBadgeCount, count),
  },

  deepLink: {
    onSsoCallback: (cb: (payload: { loginToken: string }) => void): (() => void) => {
      const listener = (_e: Electron.IpcRendererEvent, payload: { loginToken: string }) =>
        cb(payload);
      ipcRenderer.on(IpcChannels.DeepLink.SsoCallback, listener);
      return () => ipcRenderer.off(IpcChannels.DeepLink.SsoCallback, listener);
    },
  },
};

export type NativeApi = typeof nativeApi;

try {
  contextBridge.exposeInMainWorld('electron', electronAPI);
  contextBridge.exposeInMainWorld('native', nativeApi);
} catch (err) {
  console.error('Failed to expose preload APIs:', err);
}
