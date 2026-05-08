import type { MatrixClient } from 'matrix-js-sdk';
import type { EncryptedFile } from './mxc';

/**
 * Process-wide authenticated mxc → blob URL cache.
 *
 * Each unique (account, mxc, sizing, encryption) tuple is fetched once.
 * Consumers acquire/release a refcount; the blob URL is revoked when
 * refcount hits zero AND the entry is evicted (LRU above a soft cap).
 */

export interface MediaCacheKey {
  client: MatrixClient;
  mxc: string;
  width?: number;
  height?: number;
  resizeMethod?: 'crop' | 'scale';
  encryptedFile?: EncryptedFile | null;
  mimetype?: string;
}

export interface MediaCacheEntry {
  url: string | null;
  loading: boolean;
  error: Error | null;
}

type Listener = (entry: MediaCacheEntry) => void;

interface CacheRecord {
  key: string;
  ownerUserId: string;
  refCount: number;
  entry: MediaCacheEntry;
  listeners: Set<Listener>;
  abort: AbortController | null;
  blobUrl: string | null;
  byteSize: number;
  lastTouched: number;
}

const SOFT_CAP = 512;
const records = new Map<string, CacheRecord>();

function buildKey(k: MediaCacheKey): string {
  const userId = k.client.getUserId() ?? '';
  const enc = k.encryptedFile ? `enc:${k.encryptedFile.url}` : 'plain';
  return [
    userId,
    k.mxc,
    k.width ?? '',
    k.height ?? '',
    k.resizeMethod ?? '',
    enc,
    k.mimetype ?? '',
  ].join('|');
}

function notify(record: CacheRecord) {
  for (const l of record.listeners) {
    try {
      l(record.entry);
    } catch (err) {
      console.warn('[mediaCache] listener threw', err);
    }
  }
}

function evict(record: CacheRecord) {
  if (record.blobUrl) URL.revokeObjectURL(record.blobUrl);
  if (record.abort) record.abort.abort();
  records.delete(record.key);
}

function maybeEvict() {
  if (records.size <= SOFT_CAP) return;
  // LRU: drop oldest zero-ref records first.
  const sorted = Array.from(records.values())
    .filter((r) => r.refCount === 0)
    .sort((a, b) => a.lastTouched - b.lastTouched);
  const target = records.size - SOFT_CAP;
  for (let i = 0; i < target && i < sorted.length; i++) {
    evict(sorted[i]);
  }
}

async function fetchPlain(record: CacheRecord, k: MediaCacheKey) {
  const httpUrl = k.client.mxcUrlToHttp(
    k.mxc,
    k.width,
    k.height,
    k.resizeMethod ?? 'scale',
    false,
    true,
    true,
  );
  if (!httpUrl) {
    record.entry = { url: null, loading: false, error: new Error('mxc unresolvable') };
    notify(record);
    return;
  }
  const token = k.client.getAccessToken();
  const ac = new AbortController();
  record.abort = ac;
  try {
    const r = await fetch(httpUrl, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: ac.signal,
    });
    if (!r.ok) throw new Error(`media ${r.status}`);
    const blob = await r.blob();
    if (ac.signal.aborted) return;
    const url = URL.createObjectURL(blob);
    record.blobUrl = url;
    record.byteSize = blob.size;
    record.entry = { url, loading: false, error: null };
    notify(record);
  } catch (err) {
    if (ac.signal.aborted) return;
    record.entry = { url: null, loading: false, error: err instanceof Error ? err : new Error(String(err)) };
    notify(record);
  } finally {
    if (record.abort === ac) record.abort = null;
  }
}

async function fetchEncrypted(record: CacheRecord, k: MediaCacheKey) {
  const file = k.encryptedFile;
  if (!file) return;
  // Encrypted media must be fetched at full size — the server can't resize ciphertext.
  const httpUrl = k.client.mxcUrlToHttp(file.url, undefined, undefined, undefined, false, true, true);
  if (!httpUrl) {
    record.entry = { url: null, loading: false, error: new Error('mxc unresolvable') };
    notify(record);
    return;
  }
  const token = k.client.getAccessToken();
  const ac = new AbortController();
  record.abort = ac;
  try {
    const r = await fetch(httpUrl, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: ac.signal,
    });
    if (!r.ok) throw new Error(`media ${r.status}`);
    const ciphertext = await r.arrayBuffer();
    if (ac.signal.aborted) return;

    const expectedHash = file.hashes.sha256;
    if (expectedHash) {
      const digest = await globalThis.crypto.subtle.digest('SHA-256', ciphertext);
      const got = base64Unpadded(new Uint8Array(digest));
      const want = expectedHash.replace(/=+$/, '');
      if (got !== want) throw new Error('attachment hash mismatch');
    }
    const aesKey = await globalThis.crypto.subtle.importKey(
      'jwk',
      file.key,
      { name: 'AES-CTR' },
      false,
      ['decrypt'],
    );
    const iv = base64ToBytes(file.iv);
    const plaintext = await globalThis.crypto.subtle.decrypt(
      { name: 'AES-CTR', counter: iv as BufferSource, length: 64 },
      aesKey,
      ciphertext,
    );
    if (ac.signal.aborted) return;
    const blob = new Blob([plaintext], k.mimetype ? { type: k.mimetype } : {});
    const url = URL.createObjectURL(blob);
    record.blobUrl = url;
    record.byteSize = blob.size;
    record.entry = { url, loading: false, error: null };
    notify(record);
  } catch (err) {
    if (ac.signal.aborted) return;
    record.entry = { url: null, loading: false, error: err instanceof Error ? err : new Error(String(err)) };
    notify(record);
  } finally {
    if (record.abort === ac) record.abort = null;
  }
}

export function acquire(key: MediaCacheKey, listener: Listener): () => void {
  const k = buildKey(key);
  let record = records.get(k);
  if (!record) {
    record = {
      key: k,
      ownerUserId: key.client.getUserId() ?? '',
      refCount: 0,
      entry: { url: null, loading: true, error: null },
      listeners: new Set(),
      abort: null,
      blobUrl: null,
      byteSize: 0,
      lastTouched: Date.now(),
    };
    records.set(k, record);
    // Kick off the fetch asynchronously so we can return the unsubscribe before
    // the first listener notification fires.
    const target = record;
    queueMicrotask(() => {
      if (key.encryptedFile) void fetchEncrypted(target, key);
      else void fetchPlain(target, key);
    });
  }
  record.refCount += 1;
  record.lastTouched = Date.now();
  record.listeners.add(listener);
  // Fire the current state immediately so consumers don't have to special-case
  // the initial render.
  listener(record.entry);

  let released = false;
  return () => {
    if (released) return;
    released = true;
    const r = records.get(k);
    if (!r) return;
    r.listeners.delete(listener);
    r.refCount = Math.max(0, r.refCount - 1);
    r.lastTouched = Date.now();
    if (r.refCount === 0) maybeEvict();
  };
}

export function clearForClient(client: MatrixClient): void {
  const userId = client.getUserId() ?? '';
  for (const r of Array.from(records.values())) {
    if (r.ownerUserId === userId) evict(r);
  }
}

export function stats(): { entries: number; bytesApprox: number } {
  let bytes = 0;
  for (const r of records.values()) bytes += r.byteSize;
  return { entries: records.size, bytesApprox: bytes };
}

function base64ToBytes(s: string): Uint8Array {
  const padded = s + '==='.slice((s.length + 3) % 4);
  const bin = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function base64Unpadded(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/=+$/, '');
}
