import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useAccountsStore } from '@/state/accounts';
import { accountManager } from '@/matrix/AccountManager';
import {
  acceptIncomingVerification,
  ensureCryptoBootstrapped,
  unlockWithRecoveryKey,
  verifyOwnDevice,
  type SasHandle,
} from '@/matrix/verification';
import type { VerificationRequest } from 'matrix-js-sdk/lib/crypto-api/verification';
import { CryptoEvent } from 'matrix-js-sdk/lib/crypto-api/CryptoEvent';

interface Device {
  id: string;
  displayName?: string;
  lastSeenTs?: number;
  lastSeenIp?: string;
}

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const activeAccountId = useAccountsStore((s) => s.activeAccountId);
  const activeAccount = useAccountsStore((s) =>
    activeAccountId ? s.accounts[activeAccountId] : null,
  );
  const [devices, setDevices] = useState<Device[]>([]);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [incoming, setIncoming] = useState<VerificationRequest | null>(null);
  const [sas, setSas] = useState<SasHandle | null>(null);
  const [recoveryKey, setRecoveryKey] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [unlockMsg, setUnlockMsg] = useState<string | null>(null);
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const client = activeAccountId ? (accountManager.getClient(activeAccountId) ?? null) : null;

  useEffect(() => {
    if (!client) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await client.getDevices();
        if (cancelled) return;
        setDevices(
          res.devices.map((d) => ({
            id: d.device_id,
            displayName: d.display_name,
            lastSeenTs: d.last_seen_ts,
            lastSeenIp: d.last_seen_ip,
          })),
        );
      } catch (err) {
        console.error(err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client]);

  useEffect(() => {
    if (!client) return;
    const handler = (request: VerificationRequest) => {
      if (!request.initiatedByMe) setIncoming(request);
    };
    client.on(CryptoEvent.VerificationRequestReceived, handler);
    return () => {
      client.off(CryptoEvent.VerificationRequestReceived, handler);
    };
  }, [client]);

  async function onBootstrap() {
    if (!client) return;
    setError(null);
    setBootstrapping(true);
    try {
      await ensureCryptoBootstrapped(client);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBootstrapping(false);
    }
  }

  async function onVerify(deviceId: string) {
    if (!client) return;
    setError(null);
    try {
      const handle = await verifyOwnDevice(client, deviceId);
      setSas(handle);
      handle.onDone.then(() => setSas(null)).catch(() => setSas(null));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function onAcceptIncoming() {
    if (!incoming) return;
    const handle = await acceptIncomingVerification(incoming);
    setIncoming(null);
    setSas(handle);
    handle.onDone.then(() => setSas(null)).catch(() => setSas(null));
  }

  async function onUnlockRecovery() {
    if (!client || !activeAccountId) return;
    setError(null);
    setUnlockMsg(null);
    setUnlocking(true);
    try {
      await unlockWithRecoveryKey(client, activeAccountId, recoveryKey);
      setRecoveryKey('');
      setUnlockMsg('Unlocked. Restoring encrypted history from key backup…');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUnlocking(false);
    }
  }

  async function onSignOut() {
    if (!activeAccountId) return;
    setSigningOut(true);
    try {
      await accountManager.removeAccount(activeAccountId);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSigningOut(false);
      setConfirmingSignOut(false);
    }
  }

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-[var(--color-backdrop)]">
      <div className="flex h-[80vh] w-[820px] flex-col rounded-xl bg-[var(--color-panel)] shadow-2xl">
        <header className="flex h-12 items-center justify-between border-b border-[var(--color-divider)] px-4">
          <h2 className="font-semibold">Settings</h2>
          <button type="button" className="rounded p-1 hover:bg-[var(--color-hover-overlay)]" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-6">
          <section className="mb-6">
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
              Encryption
            </h3>
            <p className="mb-3 text-xs text-[var(--color-text-muted)]">
              To decrypt messages sent before this device logged in, verify this device from
              another signed-in session, or enter your recovery key below.
            </p>
            <div className="flex flex-col gap-2 rounded-md bg-[var(--color-surface)] p-3">
              <label className="text-xs font-medium text-[var(--color-text-muted)]" htmlFor="recovery-key">
                Recovery key
              </label>
              <input
                id="recovery-key"
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder="EsT1 2AbC 3dEf …"
                value={recoveryKey}
                onChange={(e) => setRecoveryKey(e.target.value)}
                className="rounded-md bg-[var(--color-panel)] px-3 py-1.5 font-mono text-sm outline-none ring-1 ring-[var(--color-divider)] focus:ring-[var(--color-accent)]"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onUnlockRecovery}
                  disabled={unlocking || !recoveryKey.trim()}
                  className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
                >
                  {unlocking ? 'Unlocking…' : 'Unlock key backup'}
                </button>
                <button
                  type="button"
                  onClick={onBootstrap}
                  disabled={bootstrapping}
                  title="Only use this on a brand-new account with no existing backup"
                  className="rounded-md bg-[var(--color-panel-2)] px-3 py-1.5 text-sm hover:bg-[var(--color-hover-overlay)] disabled:opacity-50"
                >
                  {bootstrapping ? 'Setting up…' : 'First-time setup'}
                </button>
              </div>
              {unlockMsg && (
                <div className="rounded-md bg-emerald-900/40 px-3 py-2 text-sm text-emerald-200">
                  {unlockMsg}
                </div>
              )}
            </div>
            {error && (
              <div className="mt-2 rounded-md bg-red-900/40 px-3 py-2 text-sm text-red-200">
                {error}
              </div>
            )}
          </section>

          <section className="mb-6">
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
              Devices
            </h3>
            <ul className="space-y-1">
              {devices.map((d) => (
                <li
                  key={d.id}
                  className="flex items-center justify-between rounded-md bg-[var(--color-surface)] px-3 py-2 text-sm"
                >
                  <div>
                    <div className="font-medium text-[var(--color-text-strong)]">{d.displayName || d.id}</div>
                    <div className="text-xs text-[var(--color-text-faint)]">
                      {d.id}
                      {d.lastSeenTs ? ` · ${new Date(d.lastSeenTs).toLocaleString()}` : ''}
                    </div>
                  </div>
                  {d.id !== client?.getDeviceId() && (
                    <button
                      type="button"
                      onClick={() => onVerify(d.id)}
                      className="rounded-md bg-[var(--color-panel-2)] px-2 py-1 text-xs hover:bg-[var(--color-accent)]"
                    >
                      Verify
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
              Account
            </h3>
            <div className="flex flex-col gap-3 rounded-md border border-red-900/50 bg-red-950/30 p-3">
              <div>
                <div className="text-sm font-medium text-[var(--color-text-strong)]">
                  Sign out of {activeAccount?.displayName || activeAccount?.userId || 'this account'}
                </div>
                <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                  Invalidates this session on the server and removes local account data from this
                  computer. You will need your recovery key (or another verified session) to read
                  encrypted history when you sign back in.
                </p>
              </div>
              {confirmingSignOut ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onSignOut}
                    disabled={signingOut}
                    className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
                  >
                    {signingOut ? 'Signing out…' : 'Confirm sign out'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingSignOut(false)}
                    disabled={signingOut}
                    className="rounded-md bg-[var(--color-panel-2)] px-3 py-1.5 text-sm"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingSignOut(true)}
                  className="self-start rounded-md bg-red-600/80 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-600"
                >
                  Sign out & remove account
                </button>
              )}
            </div>
          </section>
        </div>
      </div>

      {incoming && (
        <VerificationIncoming
          onAccept={onAcceptIncoming}
          onDecline={async () => {
            await incoming.cancel();
            setIncoming(null);
          }}
        />
      )}
      {sas && <VerificationEmoji handle={sas} onClose={() => setSas(null)} />}
    </div>
  );
}

function VerificationIncoming({
  onAccept,
  onDecline,
}: {
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-[var(--color-backdrop-strong)]">
      <div className="w-[360px] rounded-xl bg-[var(--color-panel-2)] p-6 text-center">
        <h3 className="mb-3 text-lg font-semibold">Incoming verification</h3>
        <p className="mb-4 text-sm text-[var(--color-text-muted)]">
          Another session wants to verify this one.
        </p>
        <div className="flex justify-center gap-2">
          <button
            type="button"
            className="rounded-md bg-[var(--color-surface)] px-3 py-1.5 text-sm"
            onClick={onDecline}
          >
            Decline
          </button>
          <button
            type="button"
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm text-white"
            onClick={onAccept}
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}

function VerificationEmoji({
  handle,
  onClose,
}: {
  handle: SasHandle;
  onClose: () => void;
}) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-[var(--color-backdrop-strong)]">
      <div className="w-[460px] rounded-xl bg-[var(--color-panel-2)] p-6 text-center">
        <h3 className="mb-1 text-lg font-semibold">Compare emojis</h3>
        <p className="mb-4 text-sm text-[var(--color-text-muted)]">
          Both devices should show the same emojis in the same order.
        </p>
        <div className="mb-4 flex flex-wrap justify-center gap-3">
          {handle.emoji.map(([emoji, label]) => (
            <div key={label} className="w-16">
              <div className="text-3xl">{emoji}</div>
              <div className="text-xs text-[var(--color-text-muted)]">{label}</div>
            </div>
          ))}
        </div>
        <div className="flex justify-center gap-2">
          <button
            type="button"
            className="rounded-md bg-red-600 px-3 py-1.5 text-sm text-white"
            onClick={async () => {
              await handle.mismatch();
              onClose();
            }}
          >
            They don’t match
          </button>
          <button
            type="button"
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm text-white"
            onClick={async () => {
              await handle.confirm();
            }}
          >
            They match
          </button>
        </div>
      </div>
    </div>
  );
}
