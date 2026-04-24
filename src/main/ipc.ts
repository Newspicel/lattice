import { ipcMain } from 'electron';
import { IpcChannels } from '@shared/ipc-channels';
import {
  deleteAccount,
  deleteSecret,
  getSecret,
  listAccounts,
  setSecret,
  upsertAccount,
} from './secrets.js';
import type { AccountMetadata } from '@shared/types';

export function registerIpcHandlers(): void {
  ipcMain.handle(IpcChannels.Secrets.Get, (_e, key: string) => getSecret(key));
  ipcMain.handle(IpcChannels.Secrets.Set, (_e, key: string, value: string) => setSecret(key, value));
  ipcMain.handle(IpcChannels.Secrets.Delete, (_e, key: string) => deleteSecret(key));

  ipcMain.handle(IpcChannels.Accounts.ListMetadata, () => listAccounts());
  ipcMain.handle(IpcChannels.Accounts.UpsertMetadata, (_e, account: AccountMetadata) =>
    upsertAccount(account),
  );
  ipcMain.handle(IpcChannels.Accounts.DeleteMetadata, (_e, id: string) => deleteAccount(id));
}
