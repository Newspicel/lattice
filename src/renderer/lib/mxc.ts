import type { MatrixClient } from 'matrix-js-sdk';

/**
 * Resolve an `mxc://` URI to an authenticated media URL.
 * Pass `client.mxcUrlToHttp(mxc, w, h, method, allowDirectLinks, allowRedirects, useAuth)`.
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
