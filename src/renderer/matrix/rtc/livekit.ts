import type { MatrixClient } from 'matrix-js-sdk';
import type { LivekitFocus } from './discovery';

export interface LivekitJwt {
  url: string;
  jwt: string;
}

/**
 * Exchange an OpenID token from our homeserver for a LiveKit JWT from an
 * `lk-jwt-service`-compatible endpoint advertised by the focus. The LiveKit
 * room identifier is `!roomId:server`.
 */
export async function getLivekitToken(
  client: MatrixClient,
  focus: LivekitFocus,
  matrixRoomId: string,
): Promise<LivekitJwt> {
  const openIdToken = await client.getOpenIdToken();
  const endpoint = focus.livekit_service_url.replace(/\/+$/, '') + '/sfu/get';

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      room: matrixRoomId,
      openid_token: openIdToken,
      device_id: client.getDeviceId() ?? '',
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`lk-jwt-service returned ${res.status}: ${text}`);
  }
  const body: { url: string; jwt: string } = await res.json();
  return { url: body.url, jwt: body.jwt };
}
