import type {
  CryptoCallbacks,
  GeneratedSecretStorageKey,
} from 'matrix-js-sdk/lib/crypto-api';

const secretKey = (accountId: string) => `ssss-key:${accountId}`;

interface CachedKey {
  keyId: string;
  key: Uint8Array<ArrayBuffer>;
}

const inMemory = new Map<string, CachedKey>();

/**
 * Build the `getSecretStorageKey` / `cacheSecretStorageKey` callbacks for one
 * account. The key is cached in memory (so the SDK can call back synchronously
 * during bootstrap) and mirrored to the OS secret store so it survives restarts.
 */
export function buildSecretStorageCallbacks(accountId: string): CryptoCallbacks {
  return {
    getSecretStorageKey: async ({ keys }) => {
      const cached = await loadCached(accountId);
      if (!cached) return null;
      // Only return the cached key if the SDK is actually asking for it —
      // otherwise we'd hand back bytes that won't decrypt the requested secret.
      if (!keys[cached.keyId]) return null;
      return [cached.keyId, cached.key];
    },
    cacheSecretStorageKey: (keyId, _info, key) => {
      const copy = toAb(key);
      inMemory.set(accountId, { keyId, key: copy });
      void window.native.secrets.set(secretKey(accountId), serialize(keyId, copy));
    },
  };
}

/**
 * Prime the SSSS cache with a user-supplied recovery key so subsequent
 * `getSecretStorageKey` calls can satisfy the SDK without prompting again.
 * The caller is responsible for validating the key against the server-side
 * key info before calling this.
 */
export function cacheRecoveryKey(
  accountId: string,
  keyId: string,
  key: Uint8Array,
): void {
  const copy = toAb(key);
  inMemory.set(accountId, { keyId, key: copy });
  void window.native.secrets.set(secretKey(accountId), serialize(keyId, copy));
}

export async function forgetAccountSecrets(accountId: string): Promise<void> {
  inMemory.delete(accountId);
  await Promise.all([
    window.native.secrets.delete(secretKey(accountId)),
    window.native.secrets.delete(`access-token:${accountId}`),
    window.native.secrets.delete(`pickle-key:${accountId}`),
  ]);
}

async function loadCached(accountId: string): Promise<CachedKey | null> {
  const existing = inMemory.get(accountId);
  if (existing) return existing;
  const stored = await window.native.secrets.get(secretKey(accountId));
  if (!stored) return null;
  const parsed = deserialize(stored);
  if (!parsed) return null;
  inMemory.set(accountId, parsed);
  return parsed;
}

function toAb(key: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(key.byteLength));
  out.set(key);
  return out;
}

export async function createSecretStorageKey(): Promise<GeneratedSecretStorageKey> {
  const privateKey = crypto.getRandomValues(new Uint8Array(32));
  return { privateKey };
}

function serialize(keyId: string, key: Uint8Array): string {
  return `${keyId}:${bytesToBase64(key)}`;
}

function deserialize(stored: string): CachedKey | null {
  const sep = stored.indexOf(':');
  if (sep <= 0) return null;
  const keyId = stored.slice(0, sep);
  const key = base64ToBytes(stored.slice(sep + 1));
  return { keyId, key };
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
