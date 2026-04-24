import { createClient, IndexedDBStore, type MatrixClient } from 'matrix-js-sdk';

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
}: CreateClientOpts): Promise<MatrixClient> {
  const store = new IndexedDBStore({
    indexedDB: window.indexedDB,
    dbName: `mx-sync:${accountId}`,
    localStorage: window.localStorage,
  });
  await store.startup();

  const client = createClient({
    baseUrl: credentials.homeserverUrl,
    userId: credentials.userId,
    deviceId: credentials.deviceId,
    accessToken: credentials.accessToken,
    refreshToken: credentials.refreshToken,
    store,
    timelineSupport: true,
    useAuthorizationHeader: true,
  });

  await client.initRustCrypto({
    useIndexedDB: true,
    cryptoDatabasePrefix: `mx-crypto:${accountId}`,
    storageKey: cryptoStorageKey,
  });

  return client;
}

/**
 * Lightweight client used only to run the login flow against a homeserver — it
 * is NOT configured with storage or crypto. After `loginRequest` returns we
 * discard it and build a proper client with `buildMatrixClient`.
 */
export function buildLoginClient(homeserverUrl: string): MatrixClient {
  return createClient({ baseUrl: homeserverUrl });
}
