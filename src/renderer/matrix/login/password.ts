import { buildLoginClient } from '../createClient';
import type { ClientCredentials } from '../createClient';

export interface PasswordLoginInput {
  homeserverUrl: string;
  username: string;
  password: string;
  initialDeviceDisplayName?: string;
}

export async function loginWithPassword({
  homeserverUrl,
  username,
  password,
  initialDeviceDisplayName = 'Matrix Client (desktop)',
}: PasswordLoginInput): Promise<ClientCredentials> {
  const client = buildLoginClient(homeserverUrl);

  const identifier = username.startsWith('@')
    ? { type: 'm.id.user', user: username }
    : { type: 'm.id.user', user: username };

  const response = await client.loginRequest({
    type: 'm.login.password',
    identifier,
    password,
    initial_device_display_name: initialDeviceDisplayName,
  });

  return {
    userId: response.user_id,
    deviceId: response.device_id,
    accessToken: response.access_token,
    refreshToken: response.refresh_token,
    homeserverUrl,
  };
}

export async function resolveHomeserverUrl(userOrHomeserver: string): Promise<string> {
  const input = userOrHomeserver.trim();
  if (input.startsWith('http://') || input.startsWith('https://')) return input.replace(/\/+$/, '');

  const domain = input.startsWith('@') ? input.split(':').slice(1).join(':') : input;
  const wellKnownUrl = `https://${domain}/.well-known/matrix/client`;

  try {
    const res = await fetch(wellKnownUrl);
    if (res.ok) {
      const data: { 'm.homeserver'?: { base_url?: string } } = await res.json();
      const baseUrl = data['m.homeserver']?.base_url;
      if (baseUrl) return baseUrl.replace(/\/+$/, '');
    }
  } catch {
    // Fall back to domain-as-homeserver below.
  }
  return `https://${domain}`;
}
