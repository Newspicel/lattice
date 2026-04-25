import { useEffect, useState, type ImgHTMLAttributes } from 'react';
import type { MatrixClient } from 'matrix-js-sdk';

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

/**
 * Fetch an authenticated media URL with the client's access token and return
 * a blob URL suitable for `<img src>`. The blob URL is revoked on unmount or
 * when inputs change.
 */
export function useAuthedMedia(
  client: MatrixClient | null | undefined,
  mxc: string | null | undefined,
  width = 96,
  height = 96,
): string | null {
  // Track which mxc the loaded blob URL belongs to so a prop change
  // immediately hides the previous source instead of showing it until the
  // new fetch resolves.
  const [loaded, setLoaded] = useState<{ mxc: string; url: string } | null>(null);

  useEffect(() => {
    if (!client || !mxc) {
      setLoaded(null);
      return;
    }
    const httpUrl = client.mxcUrlToHttp(mxc, width, height, 'scale', false, true, true);
    if (!httpUrl) {
      setLoaded(null);
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;
    const token = client.getAccessToken();

    fetch(httpUrl, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => {
        if (!r.ok) throw new Error(`media ${r.status}`);
        return r.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setLoaded({ mxc, url: objectUrl });
      })
      .catch(() => {
        if (!cancelled) setLoaded(null);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [client, mxc, width, height]);

  return loaded && loaded.mxc === mxc ? loaded.url : null;
}

/**
 * Fetch and decrypt an encrypted attachment, returning a blob URL. Decryption
 * uses AES-CTR with the JWK key embedded in the event and verifies the SHA-256
 * hash of the ciphertext against the sender's claim.
 */
export function useAuthedEncryptedMedia(
  client: MatrixClient | null | undefined,
  file: EncryptedFile | null | undefined,
  mimetype: string | undefined,
): string | null {
  // Same prop-vs-loaded check as useAuthedMedia so a file change doesn't
  // surface the previously-loaded blob.
  const [loaded, setLoaded] = useState<{ file: EncryptedFile; url: string } | null>(null);

  useEffect(() => {
    if (!client || !file) {
      setLoaded(null);
      return;
    }
    // Encrypted media must be fetched at full size — the server can't resize
    // an opaque ciphertext. Pass 0/0 to get the download URL.
    const httpUrl = client.mxcUrlToHttp(file.url, undefined, undefined, undefined, false, true, true);
    if (!httpUrl) {
      setLoaded(null);
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;
    const token = client.getAccessToken();

    (async () => {
      const r = await fetch(httpUrl, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!r.ok) throw new Error(`media ${r.status}`);
      const ciphertext = await r.arrayBuffer();

      const expectedHash = file.hashes.sha256;
      if (expectedHash) {
        const digest = await globalThis.crypto.subtle.digest('SHA-256', ciphertext);
        if (base64Unpadded(new Uint8Array(digest)) !== stripBase64Padding(expectedHash)) {
          throw new Error('attachment hash mismatch');
        }
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
        { name: 'AES-CTR', counter: iv, length: 64 },
        aesKey,
        ciphertext,
      );

      if (cancelled) return;
      const blob = new Blob([plaintext], mimetype ? { type: mimetype } : {});
      objectUrl = URL.createObjectURL(blob);
      setLoaded({ file, url: objectUrl });
    })().catch(() => {
      if (!cancelled) setLoaded(null);
    });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [client, file, mimetype]);

  return loaded && loaded.file === file ? loaded.url : null;
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

function base64ToBytes(s: string): Uint8Array<ArrayBuffer> {
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

function stripBase64Padding(s: string): string {
  return s.replace(/=+$/, '');
}
