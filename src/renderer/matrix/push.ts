import type { MatrixClient } from 'matrix-js-sdk';

interface RegisterPusherOpts {
  pushKey: string;
  appId: string;
  appDisplayName: string;
  deviceDisplayName: string;
  url: string;
  profileTag?: string;
}

/**
 * Register an HTTP pusher (sygnal-compatible endpoint) for this client.
 * Optional — the desktop app keeps a foreground sync running, so OS-level
 * notifications work without a pusher. Use this if you have a sygnal-style
 * push gateway and want background pushes when the app is closed.
 */
export async function registerHttpPusher(
  client: MatrixClient,
  opts: RegisterPusherOpts,
): Promise<void> {
  await client.setPusher({
    pushkey: opts.pushKey,
    kind: 'http',
    app_id: opts.appId,
    app_display_name: opts.appDisplayName,
    device_display_name: opts.deviceDisplayName,
    profile_tag: opts.profileTag ?? 'default',
    lang: navigator.language,
    data: {
      url: opts.url,
      format: 'event_id_only',
    },
    append: true,
  });
}

export async function removeHttpPusher(
  client: MatrixClient,
  pushKey: string,
  appId: string,
): Promise<void> {
  await client.removePusher(pushKey, appId);
}
