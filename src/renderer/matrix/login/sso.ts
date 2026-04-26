import { MatrixError, type IIdentityProvider, type ISSOFlow } from 'matrix-js-sdk';
import { buildLoginClient } from '../createClient';
import type { ClientCredentials } from '../createClient';

const SSO_REDIRECT = 'lattice://sso-callback';

export interface SsoFlowsResult {
  homeserverUrl: string;
  providers: IIdentityProvider[];
  hasPlainSso: boolean;
  hasPassword: boolean;
}

export async function fetchLoginFlows(homeserverUrl: string): Promise<SsoFlowsResult> {
  const client = buildLoginClient(homeserverUrl);
  const res = await client.loginFlows();
  const ssoFlows = res.flows.filter((f): f is ISSOFlow => f.type === 'm.login.sso');
  const providers = ssoFlows.flatMap((f) => f.identity_providers ?? []);
  const hasPlainSso = ssoFlows.some((f) => (f.identity_providers?.length ?? 0) === 0);
  const hasPassword = res.flows.some((f) => f.type === 'm.login.password');
  return { homeserverUrl, providers, hasPlainSso, hasPassword };
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
  initialDeviceDisplayName = 'Lattice (desktop)',
): Promise<ClientCredentials> {
  const client = buildLoginClient(homeserverUrl);
  try {
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
  } catch (err) {
    throw enrichSsoTokenError(err);
  }
}

// matrix-js-sdk's MatrixError stringifies as "[<status>] <error>" but for SSO
// 500s the homeserver often only fills `errcode`/`error` in the JSON body, and
// some Synapse versions return a generic 500 when the redirect URI scheme is
// unsupported. Surface whatever extra context is available so the user has
// something actionable.
function enrichSsoTokenError(err: unknown): Error {
  if (!(err instanceof MatrixError)) return err instanceof Error ? err : new Error(String(err));
  const parts: string[] = [];
  if (err.httpStatus) parts.push(`HTTP ${err.httpStatus}`);
  if (err.errcode) parts.push(err.errcode);
  const detail = err.data?.error ?? err.error ?? err.message;
  if (detail) parts.push(detail);
  if (err.httpStatus === 500) {
    parts.push('the homeserver rejected the SSO login token — the token may be expired or the server may not support custom-scheme redirects');
  }
  return new Error(`SSO sign-in failed: ${parts.join(' · ')}`);
}
