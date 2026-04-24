import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useAccountsStore } from '@/state/accounts';
import { accountManager } from '@/matrix/AccountManager';
import {
  acceptIncomingVerification,
  ensureCryptoBootstrapped,
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
  const [devices, setDevices] = useState<Device[]>([]);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [incoming, setIncoming] = useState<VerificationRequest | null>(null);
  const [sas, setSas] = useState<SasHandle | null>(null);

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

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60">
      <div className="flex h-[80vh] w-[820px] flex-col rounded-xl bg-[var(--color-panel)] shadow-2xl">
        <header className="flex h-12 items-center justify-between border-b border-[var(--color-divider)] px-4">
          <h2 className="font-semibold">Settings</h2>
          <button type="button" className="rounded p-1 hover:bg-white/10" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-6">
          <section className="mb-6">
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-400">
              Encryption
            </h3>
            <button
              type="button"
              onClick={onBootstrap}
              disabled={bootstrapping}
              className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
            >
              {bootstrapping ? 'Setting up…' : 'Set up cross-signing & key backup'}
            </button>
            {error && (
              <div className="mt-2 rounded-md bg-red-900/40 px-3 py-2 text-sm text-red-200">
                {error}
              </div>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-400">
              Devices
            </h3>
            <ul className="space-y-1">
              {devices.map((d) => (
                <li
                  key={d.id}
                  className="flex items-center justify-between rounded-md bg-[var(--color-surface)] px-3 py-2 text-sm"
                >
                  <div>
                    <div className="font-medium text-white">{d.displayName || d.id}</div>
                    <div className="text-xs text-neutral-500">
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
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="w-[360px] rounded-xl bg-[var(--color-panel-2)] p-6 text-center">
        <h3 className="mb-3 text-lg font-semibold">Incoming verification</h3>
        <p className="mb-4 text-sm text-neutral-300">
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
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="w-[460px] rounded-xl bg-[var(--color-panel-2)] p-6 text-center">
        <h3 className="mb-1 text-lg font-semibold">Compare emojis</h3>
        <p className="mb-4 text-sm text-neutral-400">
          Both devices should show the same emojis in the same order.
        </p>
        <div className="mb-4 flex flex-wrap justify-center gap-3">
          {handle.emoji.map(([emoji, label]) => (
            <div key={label} className="w-16">
              <div className="text-3xl">{emoji}</div>
              <div className="text-xs text-neutral-400">{label}</div>
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
