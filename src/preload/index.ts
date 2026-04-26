import { contextBridge, ipcRenderer } from 'electron';
import { electronAPI } from '@electron-toolkit/preload';
import { IpcChannels } from '../shared/ipc-channels.js';
import type {
  AccountMetadata,
  NotificationPayload,
  UpdateChannel,
  UpdateState,
} from '../shared/types.js';

const nativeApi = {
  platform: process.platform,
  updatesDisabled: process.env.LATTICE_DISABLE_AUTO_UPDATE === '1',

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

  updates: {
    getState: (): Promise<UpdateState> => ipcRenderer.invoke(IpcChannels.Updates.GetState),
    getChannel: (): Promise<UpdateChannel> => ipcRenderer.invoke(IpcChannels.Updates.GetChannel),
    setChannel: (channel: UpdateChannel): Promise<UpdateChannel> =>
      ipcRenderer.invoke(IpcChannels.Updates.SetChannel, channel),
    check: (): Promise<UpdateState> => ipcRenderer.invoke(IpcChannels.Updates.Check),
    quitAndInstall: (): Promise<void> => ipcRenderer.invoke(IpcChannels.Updates.QuitAndInstall),
    onStateChanged: (cb: (state: UpdateState) => void): (() => void) => {
      const listener = (_e: Electron.IpcRendererEvent, state: UpdateState) => cb(state);
      ipcRenderer.on(IpcChannels.Updates.StateChanged, listener);
      return () => ipcRenderer.off(IpcChannels.Updates.StateChanged, listener);
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
