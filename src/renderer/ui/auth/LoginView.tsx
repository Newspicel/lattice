import { useEffect, useState } from 'react';
import { loginWithPassword, resolveHomeserverUrl } from '@/matrix/login/password';
import {
  buildSsoRedirectUrl,
  fetchLoginFlows,
  loginWithSsoToken,
  type SsoFlowsResult,
} from '@/matrix/login/sso';
import { accountManager } from '@/matrix/AccountManager';
import type { AccountMetadata } from '@shared/types';
import type { ClientCredentials } from '@/matrix/createClient';
import { Button } from '@/ui/primitives/button';
import { Input } from '@/ui/primitives/input';

export function LoginView({ onAuthenticated }: { onAuthenticated?: () => void } = {}) {
  const [homeserver, setHomeserver] = useState('matrix.org');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [flows, setFlows] = useState<SsoFlowsResult | null>(null);
  const [pendingSsoHomeserver, setPendingSsoHomeserver] = useState<string | null>(null);

  useEffect(() => {
    const unsub = window.native.deepLink.onSsoCallback(async ({ loginToken }) => {
      if (!pendingSsoHomeserver) return;
      setError(null);
      setSubmitting(true);
      try {
        const credentials = await loginWithSsoToken(pendingSsoHomeserver, loginToken);
        await finishLogin(credentials);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setSubmitting(false);
        setPendingSsoHomeserver(null);
      }
    });
    return unsub;
  }, [pendingSsoHomeserver]);

  async function onDiscoverFlows() {
    setError(null);
    setFlows(null);
    try {
      const baseUrl = await resolveHomeserverUrl(homeserver);
      const result = await fetchLoginFlows(baseUrl);
      setFlows(result);
      // If the homeserver only offers SSO with a single unambiguous option,
      // skip the extra click and open the browser straight away.
      if (!result.hasPassword) {
        if (result.providers.length === 1) {
          launchSso(baseUrl, result.providers[0].id);
        } else if (result.providers.length === 0 && result.hasPlainSso) {
          launchSso(baseUrl);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function onPasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const baseUrl = await resolveHomeserverUrl(homeserver);
      const credentials = await loginWithPassword({
        homeserverUrl: baseUrl,
        username,
        password,
      });
      await finishLogin(credentials);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function onSsoLogin(idpId?: string) {
    setError(null);
    try {
      const baseUrl = flows?.homeserverUrl ?? (await resolveHomeserverUrl(homeserver));
      launchSso(baseUrl, idpId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function launchSso(baseUrl: string, idpId?: string) {
    const url = buildSsoRedirectUrl(baseUrl, idpId);
    setPendingSsoHomeserver(baseUrl);
    window.open(url, '_blank', 'noopener');
  }

  async function finishLogin(credentials: ClientCredentials) {
    const metadata: AccountMetadata = {
      id: `${credentials.userId}:${credentials.deviceId}`,
      userId: credentials.userId,
      homeserverUrl: credentials.homeserverUrl,
      deviceId: credentials.deviceId,
      createdAt: Date.now(),
    };
    await accountManager.addAccount(metadata, credentials);
    onAuthenticated?.();
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-[var(--color-bg)] text-[var(--color-text)]">
      <form
        onSubmit={onPasswordSubmit}
        className="w-full max-w-md border border-[var(--color-divider)] bg-[var(--color-panel)]"
      >
        <div className="border-b border-[var(--color-divider)] bg-[var(--color-panel-2)] px-8 py-6">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
            Authentication
          </div>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-[var(--color-text-strong)]">
            Sign in to Matrix
          </h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Use any homeserver — matrix.org, your own, or a work deployment.
          </p>
        </div>

        <div className="space-y-4 p-8">
          <label className="block text-sm">
            <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
              Homeserver
            </span>
            <div className="flex gap-2">
              <Input
                value={homeserver}
                onChange={(e) => {
                  setHomeserver(e.target.value);
                  setFlows(null);
                }}
                placeholder="matrix.org or https://your.server"
                autoComplete="url"
                required
              />
              <Button type="button" variant="secondary" onClick={onDiscoverFlows}>
                Continue
              </Button>
            </div>
          </label>

          <label className="block text-sm">
            <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
              Username
            </span>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="you or @you:example.org"
              autoComplete="username"
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
              Password
            </span>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </label>

          {error && (
            <div className="border border-red-900/60 bg-red-950/40 px-3 py-2 text-xs text-red-300">
              {error}
            </div>
          )}

          <Button
            type="submit"
            disabled={submitting || !username || !password}
            size="lg"
            className="w-full"
          >
            {submitting ? 'Signing in…' : 'Sign in with password'}
          </Button>

          {(flows?.providers.length ?? 0) > 0 && (
            <div className="space-y-2 border-t border-[var(--color-divider)] pt-4 text-sm">
              <div className="text-center text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-faint)]">
                Single sign-on
              </div>
              {flows!.providers.map((p) => (
                <Button
                  key={p.id}
                  type="button"
                  variant="secondary"
                  onClick={() => onSsoLogin(p.id)}
                  className="w-full"
                >
                  {p.name ?? p.id}
                </Button>
              ))}
            </div>
          )}

          {flows?.hasPlainSso && (flows?.providers.length ?? 0) === 0 && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => onSsoLogin()}
              className="w-full"
            >
              Continue with SSO
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
