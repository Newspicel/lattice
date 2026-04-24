import type { IIdentityProvider, ISSOFlow } from 'matrix-js-sdk';
import { buildLoginClient } from '../createClient';
import type { ClientCredentials } from '../createClient';

const SSO_REDIRECT = 'matrix-client://sso-callback';

export interface SsoFlowsResult {
  homeserverUrl: string;
  providers: IIdentityProvider[];
  hasPlainSso: boolean;
}

export async function fetchLoginFlows(homeserverUrl: string): Promise<SsoFlowsResult> {
  const client = buildLoginClient(homeserverUrl);
  const res = await client.loginFlows();
  const ssoFlows = res.flows.filter((f): f is ISSOFlow => f.type === 'm.login.sso');
  const providers = ssoFlows.flatMap((f) => f.identity_providers ?? []);
  const hasPlainSso = ssoFlows.some((f) => (f.identity_providers?.length ?? 0) === 0);
  return { homeserverUrl, providers, hasPlainSso };
}

export function buildSsoRedirectUrl(homeserverUrl: string, idpId?: string): string {
  const client = buildLoginClient(homeserverUrl);
  return client.getSsoLoginUrl(SSO_REDIRECT, 'sso', idpId);
}

/**
 * Exchange an SSO `loginToken` (received via the deep-link callback) for a
 * full credential set.
 */
export async function loginWithSsoToken(
  homeserverUrl: string,
  loginToken: string,
  initialDeviceDisplayName = 'Matrix Client (desktop)',
): Promise<ClientCredentials> {
  const client = buildLoginClient(homeserverUrl);
  const response = await client.loginRequest({
    type: 'm.login.token',
    token: loginToken,
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
