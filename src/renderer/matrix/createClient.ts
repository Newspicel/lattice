import { createClient, IndexedDBStore, type MatrixClient } from 'matrix-js-sdk';
import type { CryptoCallbacks } from 'matrix-js-sdk/lib/crypto-api';

export interface ClientCredentials {
  userId: string;
  deviceId: string;
  accessToken: string;
  refreshToken?: string;
  homeserverUrl: string;
}

export interface CreateClientOpts {
  accountId: string;
  credentials: ClientCredentials;
  /** Raw bytes used to derive the rust-crypto storage key. */
  cryptoStorageKey: Uint8Array;
  /** Callbacks the crypto layer uses to read/write secret storage keys. */
  cryptoCallbacks: CryptoCallbacks;
}

/**
 * Build a fully configured `MatrixClient` for one account:
 *   - IndexedDB sync store (namespaced by accountId)
 *   - rust-crypto with IndexedDB persistence (namespaced by accountId)
 *
 * Caller is still responsible for `client.startClient(...)`.
 */
export async function buildMatrixClient({
  accountId,
  credentials,
  cryptoStorageKey,
  cryptoCallbacks,
}: CreateClientOpts): Promise<MatrixClient> {
  const store = new IndexedDBStore({
    indexedDB: window.indexedDB,
    dbName: `mx-sync:${accountId}`,
    localStorage: window.localStorage,
  });

  const client = createClient({
    baseUrl: credentials.homeserverUrl,
    userId: credentials.userId,
    deviceId: credentials.deviceId,
    accessToken: credentials.accessToken,
    refreshToken: credentials.refreshToken,
    store,
    timelineSupport: true,
    useAuthorizationHeader: true,
    cryptoCallbacks,
  });
  await store.startup();

  const cryptoDatabasePrefix = `mx-crypto:${accountId}`;
  try {
    await client.initRustCrypto({
      useIndexedDB: true,
      cryptoDatabasePrefix,
      storageKey: cryptoStorageKey,
    });
  } catch (err) {
    // `aead::Error` means the stored crypto DB was encrypted with a different
    // storage key than the one we now hold — the data is unrecoverable, so wipe
    // and retry with a fresh store. Historical E2EE keys are lost; backup can
    // restore them once secret storage is set up.
    if (isAeadError(err)) {
      await wipeCryptoDatabases(cryptoDatabasePrefix);
      await client.initRustCrypto({
        useIndexedDB: true,
        cryptoDatabasePrefix,
        storageKey: cryptoStorageKey,
      });
    } else {
      throw err;
    }
  }

  return client;
}

function isAeadError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('aead::Error') || msg.includes('Error encrypting or decrypting a value');
}

async function wipeCryptoDatabases(prefix: string): Promise<void> {
  const factory = window.indexedDB;
  // rust-crypto stores multiple DBs under the prefix (e.g. `<prefix>::matrix-sdk-crypto`
  // and `<prefix>::matrix-sdk-crypto-meta`). `databases()` enumerates all so we
  // can wipe each one that belongs to this account.
  const databases = typeof factory.databases === 'function' ? await factory.databases() : [];
  const matches = databases
    .map((db) => db.name)
    .filter((name): name is string => typeof name === 'string' && name.startsWith(prefix));
  await Promise.all(matches.map((name) => deleteDatabase(factory, name)));
}

function deleteDatabase(factory: IDBFactory, name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = factory.deleteDatabase(name);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}

/**
 * Lightweight client used only to run the login flow against a homeserver — it
 * is NOT configured with storage or crypto. After `loginRequest` returns we
 * discard it and build a proper client with `buildMatrixClient`.
 */
export function buildLoginClient(homeserverUrl: string): MatrixClient {
  return createClient({ baseUrl: homeserverUrl });
}
