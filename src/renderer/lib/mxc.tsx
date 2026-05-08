import { useEffect, useState, type ImgHTMLAttributes } from 'react';
import { ClientEvent, SyncState, type MatrixClient } from 'matrix-js-sdk';
import { acquire, type MediaCacheEntry } from './mediaCache';

/**
 * End-to-end encrypted attachment descriptor, as stored in the `file` field of
 * an encrypted `m.image`/`m.file`/`m.video`/`m.audio` event.
 * See https://spec.matrix.org/v1.11/client-server-api/#sending-encrypted-attachments.
 */
export interface EncryptedFile {
  url: string;
  key: { alg: string; k: string; key_ops: string[]; kty: string; ext: boolean };
  iv: string;
  hashes: Record<string, string>;
  v: string;
}

/**
 * Resolve an `mxc://` URI to an authenticated media URL.
 * The returned URL points at `/_matrix/client/v1/media/...` and requires an
 * `Authorization: Bearer` header — so it cannot be used directly as `<img src>`.
 * Use {@link useAuthedMedia} or {@link AuthedImage} instead.
 */
export function mxcToHttp(
  client: MatrixClient,
  mxc: string | null | undefined,
  width = 96,
  height = 96,
): string | null {
  if (!mxc) return null;
  return (
    client.mxcUrlToHttp(mxc, width, height, 'scale', false, true, true) ?? null
  );
}

const EMPTY_ENTRY: MediaCacheEntry = { url: null, loading: false, error: null };

/**
 * Fetch an authenticated media URL with the client's access token and return a
 * blob URL suitable for `<img src>`. Backed by a process-wide cache so the same
 * mxc URL is fetched once and shared across consumers.
 */
export function useAuthedMedia(
  client: MatrixClient | null | undefined,
  mxc: string | null | undefined,
  width = 96,
  height = 96,
): string | null {
  const [entry, setEntry] = useState<MediaCacheEntry>(EMPTY_ENTRY);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!client || !mxc) {
      setEntry(EMPTY_ENTRY);
      return;
    }
    const cleanup = makeResyncRetry(client, () => setRetry((n) => n + 1));
    const release = acquire({ client, mxc, width, height }, (next) => {
      setEntry(next);
      if (next.error) cleanup.arm();
    });
    return () => {
      release();
      cleanup.dispose();
    };
  }, [client, mxc, width, height, retry]);

  return entry.url;
}

/**
 * Fetch and decrypt an encrypted attachment, returning a blob URL. Decryption
 * uses AES-CTR with the JWK key embedded in the event and verifies the SHA-256
 * hash of the ciphertext against the sender's claim. Shares the media cache.
 */
export function useAuthedEncryptedMedia(
  client: MatrixClient | null | undefined,
  file: EncryptedFile | null | undefined,
  mimetype: string | undefined,
): string | null {
  const [entry, setEntry] = useState<MediaCacheEntry>(EMPTY_ENTRY);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!client || !file) {
      setEntry(EMPTY_ENTRY);
      return;
    }
    const cleanup = makeResyncRetry(client, () => setRetry((n) => n + 1));
    const release = acquire(
      { client, mxc: file.url, encryptedFile: file, mimetype },
      (next) => {
        setEntry(next);
        if (next.error) cleanup.arm();
      },
    );
    return () => {
      release();
      cleanup.dispose();
    };
  }, [client, file, mimetype, retry]);

  return entry.url;
}

type AuthedImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  client: MatrixClient | null | undefined;
  mxc?: string | null;
  file?: EncryptedFile | null;
  mimetype?: string;
  width?: number;
  height?: number;
  fallback?: React.ReactNode;
};

/**
 * `<img>` wrapper that resolves an `mxc://` URI (or encrypted file descriptor)
 * to a blob URL. Renders `fallback` (or nothing) while the media is loading or
 * if the source is missing.
 */
export function AuthedImage({
  client,
  mxc,
  file,
  mimetype,
  width,
  height,
  fallback = null,
  ...imgProps
}: AuthedImageProps): React.ReactNode {
  const plainUrl = useAuthedMedia(client, file ? null : mxc, width, height);
  const encUrl = useAuthedEncryptedMedia(client, file ?? null, mimetype);
  const url = file ? encUrl : plainUrl;
  if (!url) return fallback;
  return <img {...imgProps} src={url} />;
}

/**
 * After a media fetch fails, wait for the next successful sync before
 * retrying. Without this, a single network blip leaves the image stuck on
 * `null` until the deps change (or the app restarts), because the fetch
 * effect has nothing else to re-run on.
 */
function makeResyncRetry(
  client: MatrixClient,
  onRecover: () => void,
): { arm: () => void; dispose: () => void } {
  let attached = false;
  const handler = (state: SyncState) => {
    if (state !== SyncState.Prepared && state !== SyncState.Syncing) return;
    if (!attached) return;
    client.off(ClientEvent.Sync, handler);
    attached = false;
    onRecover();
  };
  return {
    arm: () => {
      if (attached) return;
      client.on(ClientEvent.Sync, handler);
      attached = true;
    },
    dispose: () => {
      if (!attached) return;
      client.off(ClientEvent.Sync, handler);
      attached = false;
    },
  };
}
