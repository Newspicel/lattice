import { useEffect, useState, type ImgHTMLAttributes } from 'react';
import type { MatrixClient } from 'matrix-js-sdk';

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
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!client || !mxc) {
      setUrl(null);
      return;
    }
    const httpUrl = client.mxcUrlToHttp(mxc, width, height, 'scale', false, true, true);
    if (!httpUrl) {
      setUrl(null);
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
        setUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [client, mxc, width, height]);

  return url;
}

type AuthedImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  client: MatrixClient | null | undefined;
  mxc: string | null | undefined;
  width?: number;
  height?: number;
  fallback?: React.ReactNode;
};

/**
 * `<img>` wrapper that resolves an `mxc://` URI against the authenticated media
 * endpoint and renders a blob URL. Renders `fallback` (or nothing) while the
 * media is loading or if the URI is missing.
 */
export function AuthedImage({
  client,
  mxc,
  width,
  height,
  fallback = null,
  ...imgProps
}: AuthedImageProps): React.ReactNode {
  const url = useAuthedMedia(client, mxc, width, height);
  if (!url) return fallback;
  // eslint-disable-next-line jsx-a11y/alt-text
  return <img {...imgProps} src={url} />;
}
