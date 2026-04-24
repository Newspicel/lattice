/**
 * Discover the MatrixRTC "focus" (SFU + JWT service) advertised by a homeserver
 * via `.well-known/matrix/client`.
 *
 * The spec key is `org.matrix.msc4143.rtc_foci` which contains an array of
 * focus objects, one of which is typed `"livekit"` with a `livekit_service_url`.
 */

export interface LivekitFocus {
  type: 'livekit';
  livekit_service_url: string;
  [key: string]: unknown;
}

interface WellKnownResponse {
  'org.matrix.msc4143.rtc_foci'?: Array<Record<string, unknown>>;
}

const cache = new Map<string, LivekitFocus[]>();

export async function discoverRtcFoci(homeserverUrl: string): Promise<LivekitFocus[]> {
  if (cache.has(homeserverUrl)) return cache.get(homeserverUrl)!;
  const origin = new URL(homeserverUrl).origin;
  try {
    const res = await fetch(`${origin}/.well-known/matrix/client`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      cache.set(homeserverUrl, []);
      return [];
    }
    const data: WellKnownResponse = await res.json();
    const raw = data['org.matrix.msc4143.rtc_foci'] ?? [];
    const foci: LivekitFocus[] = raw
      .filter(
        (f): f is LivekitFocus =>
          f['type'] === 'livekit' && typeof f['livekit_service_url'] === 'string',
      )
      .map((f) => ({
        type: 'livekit',
        livekit_service_url: f.livekit_service_url as string,
      }));
    cache.set(homeserverUrl, foci);
    return foci;
  } catch {
    cache.set(homeserverUrl, []);
    return [];
  }
}
