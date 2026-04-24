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

export function LoginView() {
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
      const url = buildSsoRedirectUrl(baseUrl, idpId);
      setPendingSsoHomeserver(baseUrl);
      window.open(url, '_blank', 'noopener');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
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
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-neutral-950 text-neutral-100">
      <form
        onSubmit={onPasswordSubmit}
        className="w-full max-w-md space-y-4 rounded-xl bg-[var(--color-panel)] p-8 shadow-xl"
      >
        <div className="text-center">
          <h1 className="text-2xl font-semibold">Sign in to Matrix</h1>
          <p className="mt-1 text-sm text-neutral-400">
            Use any homeserver — matrix.org, your own, or a work deployment.
          </p>
        </div>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-neutral-300">Homeserver</span>
          <div className="flex gap-2">
            <input
              value={homeserver}
              onChange={(e) => {
                setHomeserver(e.target.value);
                setFlows(null);
              }}
              placeholder="matrix.org or https://your.server"
              className="flex-1 rounded-md bg-[var(--color-surface)] px-3 py-2 text-neutral-100 outline-none ring-1 ring-transparent focus:ring-[var(--color-accent)]"
              autoComplete="url"
              required
            />
            <button
              type="button"
              onClick={onDiscoverFlows}
              className="rounded-md bg-[var(--color-surface)] px-3 py-2 text-sm text-neutral-200 hover:bg-[var(--color-panel-2)]"
            >
              Continue
            </button>
          </div>
        </label>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-neutral-300">Username</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="you or @you:example.org"
            className="w-full rounded-md bg-[var(--color-surface)] px-3 py-2 text-neutral-100 outline-none ring-1 ring-transparent focus:ring-[var(--color-accent)]"
            autoComplete="username"
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-neutral-300">Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md bg-[var(--color-surface)] px-3 py-2 text-neutral-100 outline-none ring-1 ring-transparent focus:ring-[var(--color-accent)]"
            autoComplete="current-password"
          />
        </label>

        {error && (
          <div className="rounded-md bg-red-900/40 px-3 py-2 text-sm text-red-200">{error}</div>
        )}

        <button
          type="submit"
          disabled={submitting || !username || !password}
          className="w-full rounded-md bg-[var(--color-accent)] px-4 py-2 font-semibold text-white transition-colors hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
        >
          {submitting ? 'Signing in…' : 'Sign in with password'}
        </button>

        {(flows?.providers.length ?? 0) > 0 && (
          <div className="space-y-2 border-t border-[var(--color-divider)] pt-3 text-sm">
            <div className="text-center text-xs uppercase tracking-wide text-neutral-500">
              Single sign-on
            </div>
            {flows!.providers.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onSsoLogin(p.id)}
                className="flex w-full items-center justify-center gap-2 rounded-md bg-[var(--color-surface)] px-3 py-2 text-neutral-200 hover:bg-[var(--color-panel-2)]"
              >
                {p.name ?? p.id}
              </button>
            ))}
          </div>
        )}

        {flows?.hasPlainSso && (flows?.providers.length ?? 0) === 0 && (
          <button
            type="button"
            onClick={() => onSsoLogin()}
            className="w-full rounded-md bg-[var(--color-surface)] px-4 py-2 text-neutral-200 hover:bg-[var(--color-panel-2)]"
          >
            Continue with SSO
          </button>
        )}
      </form>
    </div>
  );
}
