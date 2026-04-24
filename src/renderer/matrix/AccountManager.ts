import type { MatrixClient } from 'matrix-js-sdk';
import { ClientEvent, RoomEvent, SyncState } from 'matrix-js-sdk';
import type { AccountMetadata } from '@shared/types';
import { buildMatrixClient, type ClientCredentials } from './createClient';
import { maybeNotify } from './notifications';
import { useAccountsStore } from '@/state/accounts';
import { useRoomsStore } from '@/state/rooms';
import { useTimelineStore } from '@/state/timeline';

interface Account {
  metadata: AccountMetadata;
  client: MatrixClient;
}

/**
 * Owns the set of signed-in accounts. Each account gets its own MatrixClient
 * with isolated sync + crypto stores, and events are fanned out into the
 * global Zustand slices so UI can render without talking to the SDK directly.
 */
class AccountManager {
  private accounts = new Map<string, Account>();

  getClient(accountId: string): MatrixClient | undefined {
    return this.accounts.get(accountId)?.client;
  }

  getAccounts(): Account[] {
    return Array.from(this.accounts.values());
  }

  async hydrateFromMain(): Promise<void> {
    const metadatas = await window.native.accounts.list();
    for (const metadata of metadatas) {
      try {
        await this.bootAccount(metadata);
      } catch (err) {
        console.error(`Failed to boot account ${metadata.id}:`, err);
      }
    }
  }

  async addAccount(metadata: AccountMetadata, credentials: ClientCredentials): Promise<void> {
    await window.native.accounts.upsert(metadata);
    await window.native.secrets.set(`access-token:${metadata.id}`, credentials.accessToken);

    const cryptoStorageKey = await ensureCryptoStorageKey(metadata.id);
    const client = await buildMatrixClient({
      accountId: metadata.id,
      credentials,
      cryptoStorageKey,
    });

    await this.wireAndStart(metadata, client);
  }

  private async bootAccount(metadata: AccountMetadata): Promise<void> {
    const accessToken = await window.native.secrets.get(`access-token:${metadata.id}`);
    if (!accessToken) {
      console.warn(`No access token for ${metadata.id}; skipping.`);
      return;
    }
    const cryptoStorageKey = await ensureCryptoStorageKey(metadata.id);
    const credentials: ClientCredentials = {
      userId: metadata.userId,
      deviceId: metadata.deviceId,
      accessToken,
      homeserverUrl: metadata.homeserverUrl,
    };
    const client = await buildMatrixClient({
      accountId: metadata.id,
      credentials,
      cryptoStorageKey,
    });
    await this.wireAndStart(metadata, client);
  }

  private async wireAndStart(metadata: AccountMetadata, client: MatrixClient): Promise<void> {
    this.accounts.set(metadata.id, { metadata, client });
    useAccountsStore.getState().upsert(metadata);

    client.on(ClientEvent.Sync, (state: SyncState) => {
      useAccountsStore.getState().setSyncState(metadata.id, state);
      if (state === SyncState.Prepared || state === SyncState.Syncing) {
        useRoomsStore.getState().refreshRooms(metadata.id, client);
      }
      if (state === SyncState.Error) {
        // matrix-js-sdk auto-retries internally; just log for visibility.
        console.warn(`[sync ${metadata.id}] error — auto-retrying`);
      }
    });

    client.on(ClientEvent.Room, () => {
      useRoomsStore.getState().refreshRooms(metadata.id, client);
    });

    client.on(RoomEvent.Timeline, (event, room, toStartOfTimeline) => {
      if (!room || toStartOfTimeline) return;
      useTimelineStore.getState().onTimelineAppend(metadata.id, room.roomId, client);
      useRoomsStore.getState().refreshRooms(metadata.id, client);
      maybeNotify(metadata.id, client, event, room);
    });

    client.on(RoomEvent.Redaction, (_event, room) => {
      if (!room) return;
      useTimelineStore.getState().onTimelineAppend(metadata.id, room.roomId, client);
    });

    client.on(RoomEvent.LocalEchoUpdated, (_event, room) => {
      useTimelineStore.getState().onTimelineAppend(metadata.id, room.roomId, client);
    });

    await client.startClient({
      initialSyncLimit: 30,
      lazyLoadMembers: true,
      threadSupport: true,
    });
  }

  async removeAccount(accountId: string): Promise<void> {
    const entry = this.accounts.get(accountId);
    if (entry) {
      entry.client.stopClient();
      try {
        await entry.client.logout();
      } catch {
        // Best effort — if the server is unreachable, still wipe locally.
      }
      this.accounts.delete(accountId);
    }
    await window.native.accounts.delete(accountId);
    useAccountsStore.getState().remove(accountId);
    useRoomsStore.getState().removeAccount(accountId);
  }
}

async function ensureCryptoStorageKey(accountId: string): Promise<Uint8Array> {
  const existing = await window.native.secrets.get(`pickle-key:${accountId}`);
  if (existing) {
    return base64ToBytes(existing);
  }
  const fresh = crypto.getRandomValues(new Uint8Array(32));
  await window.native.secrets.set(`pickle-key:${accountId}`, bytesToBase64(fresh));
  return fresh;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export const accountManager = new AccountManager();
