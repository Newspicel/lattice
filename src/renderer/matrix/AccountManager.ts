import type { MatrixClient, MatrixEvent } from 'matrix-js-sdk';
import { ClientEvent, MatrixEventEvent, RoomEvent, SyncState } from 'matrix-js-sdk';
import { CryptoEvent } from 'matrix-js-sdk/lib/crypto-api/CryptoEvent';
import type { AccountMetadata } from '@shared/types';
import { buildMatrixClient, type ClientCredentials } from './createClient';
import { buildSecretStorageCallbacks, forgetAccountSecrets } from './secretStorage';
import { maybeNotify } from './notifications';
import { retryUndecryptedEvents } from './verification';
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
  // Per-account de-dup for restoreBackupAndDecrypt. The cached-key event can
  // arrive concurrently with the explicit boot-time restore (or twice in
  // quick succession during verification), and restoreKeyBackup downloads
  // the entire backup — running it in parallel is just wasted bandwidth.
  private restorePromises = new Map<string, Promise<void>>();

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
    for (const existing of this.accounts.values()) {
      if (existing.metadata.userId === metadata.userId) {
        throw new Error(`Already signed in as ${metadata.userId}`);
      }
    }
    await window.native.accounts.upsert(metadata);
    await window.native.secrets.set(`access-token:${metadata.id}`, credentials.accessToken);

    const cryptoStorageKey = await ensureCryptoStorageKey(metadata.id);
    const client = await buildMatrixClient({
      accountId: metadata.id,
      credentials,
      cryptoStorageKey,
      cryptoCallbacks: buildSecretStorageCallbacks(metadata.id),
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
      cryptoCallbacks: buildSecretStorageCallbacks(metadata.id),
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
      if (!room) return;
      useTimelineStore.getState().onTimelineAppend(metadata.id, room.roomId, client);
      if (toStartOfTimeline) return;
      useRoomsStore.getState().refreshRooms(metadata.id, client);
      maybeNotify(metadata.id, client, event, room);
    });

    client.on(RoomEvent.Redaction, (_event, room) => {
      if (!room) return;
      useTimelineStore.getState().onTimelineAppend(metadata.id, room.roomId, client);
    });

    // Refresh room summaries when receipts update unread counts (our own
    // outgoing read receipts, as well as echoes from other devices).
    client.on(RoomEvent.Receipt, () => {
      useRoomsStore.getState().refreshRooms(metadata.id, client);
    });

    client.on(RoomEvent.LocalEchoUpdated, (_event, room) => {
      useTimelineStore.getState().onTimelineAppend(metadata.id, room.roomId, client);
    });

    // Backfilled/live E2EE events arrive first in `m.room.encrypted` form and
    // are decrypted asynchronously. Refresh the timeline once the clear content
    // is available so the message body actually renders.
    client.on(MatrixEventEvent.Decrypted, (event: MatrixEvent) => {
      const roomId = event.getRoomId();
      if (!roomId) return;
      useTimelineStore.getState().onTimelineAppend(metadata.id, roomId, client);
    });

    // Fires when the backup decryption key gets cached — either because the
    // user just entered their recovery key, or because a freshly-verified
    // device gossiped the secret over to-device. Without this, group-room
    // history sent before this device logged in stays "unable to decrypt"
    // until a client restart, because nothing else triggers the actual
    // backup download (the SDK leaves it to the client; see comment in
    // matrix-js-sdk RustCrypto.handleSecretReceived).
    client.on(CryptoEvent.KeyBackupDecryptionKeyCached, () => {
      void this.restoreBackupAndDecrypt(metadata.id, client);
    });

    await client.startClient({
      initialSyncLimit: 30,
      lazyLoadMembers: true,
      threadSupport: true,
    });

    void this.restoreBackupAndDecrypt(metadata.id, client);
  }

  /**
   * Pull historical room keys from key backup and force-retry any events
   * that previously failed decryption. Runs on each boot (covers the case
   * where the backup key was already cached from a previous session) and
   * each time `KeyBackupDecryptionKeyCached` fires (covers recovery-key
   * entry and post-verification gossip). No-op when no backup key is
   * cached yet.
   */
  private restoreBackupAndDecrypt(accountId: string, client: MatrixClient): Promise<void> {
    const existing = this.restorePromises.get(accountId);
    if (existing) return existing;
    const promise = (async () => {
      const crypto = client.getCrypto();
      if (!crypto) return;
      try {
        const privateKey = await crypto.getSessionBackupPrivateKey();
        if (!privateKey) return;
        await crypto.checkKeyBackupAndEnable();
        await crypto.restoreKeyBackup();
      } catch (err) {
        console.warn(`[backup ${accountId}] restore attempt failed`, err);
      }
      // Sweep events the rust SDK didn't auto-retry (events whose pending-list
      // tracking was lost, or that failed before the OlmMachine was ready).
      retryUndecryptedEvents(client);
    })();
    this.restorePromises.set(accountId, promise);
    void promise.finally(() => {
      this.restorePromises.delete(accountId);
    });
    return promise;
  }

  async removeAccount(accountId: string): Promise<void> {
    const entry = this.accounts.get(accountId);
    if (entry) {
      try {
        // stopClient: true — invalidates the server-side session (device) AND
        // tears the sync loop down locally.
        await entry.client.logout(true);
      } catch (err) {
        // Best effort — if the server is unreachable, still wipe locally.
        console.warn(`[accounts ${accountId}] logout failed`, err);
        entry.client.stopClient();
      }
      this.accounts.delete(accountId);
    }
    await window.native.accounts.delete(accountId);
    await forgetAccountSecrets(accountId);
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
