import { useEffect, useState } from 'react';
import {
  Download,
  KeyRound,
  MonitorSmartphone,
  Settings as SettingsIcon,
  User,
  X,
} from 'lucide-react';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { CryptoEvent } from 'matrix-js-sdk/lib/crypto-api/CryptoEvent';
import type { VerificationRequest } from 'matrix-js-sdk/lib/crypto-api/verification';
import { useAccountsStore } from '@/state/accounts';
import { accountManager } from '@/matrix/AccountManager';
import { acceptIncomingVerification, type SasHandle } from '@/matrix/verification';
import { AuthedImage } from '@/lib/mxc';
import { useOwnProfile } from '@/lib/profile';
import { cn } from '@/lib/utils';
import { Button } from '@/ui/primitives/button';
import { AccountPanel } from './AccountPanel';
import { DevicesPanel } from './DevicesPanel';
import { EncryptionPanel } from './EncryptionPanel';
import { GeneralPanel } from './GeneralPanel';
import { UpdatesPanel } from './UpdatesPanel';

type TabId = 'general' | 'updates' | 'account' | 'encryption' | 'devices';

interface TabDef {
  id: TabId;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}

const CLIENT_TABS: TabDef[] = [
  { id: 'general', label: 'General', icon: SettingsIcon },
  { id: 'updates', label: 'Updates', icon: Download },
];

const ACCOUNT_TABS: TabDef[] = [
  { id: 'account', label: 'Account', icon: User },
  { id: 'encryption', label: 'Encryption', icon: KeyRound },
  { id: 'devices', label: 'Devices', icon: MonitorSmartphone },
];

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const activeAccountId = useAccountsStore((s) => s.activeAccountId);
  const activeAccount = useAccountsStore((s) =>
    activeAccountId ? s.accounts[activeAccountId] : null,
  );
  const client = activeAccountId ? (accountManager.getClient(activeAccountId) ?? null) : null;
  const profile = useOwnProfile(client, activeAccount?.userId ?? '');

  const [tab, setTab] = useState<TabId>('general');
  const [incoming, setIncoming] = useState<VerificationRequest | null>(null);
  const [sas, setSas] = useState<SasHandle | null>(null);

  // Incoming verification requests can arrive on any active account.
  // Show them as a modal on top of the settings dialog.
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

  function trackSas(handle: SasHandle) {
    setSas(handle);
    handle.onDone.then(() => setSas(null)).catch(() => setSas(null));
  }

  async function onAcceptIncoming() {
    if (!incoming) return;
    const handle = await acceptIncomingVerification(incoming);
    setIncoming(null);
    trackSas(handle);
  }

  const accountLabel =
    profile.displayName?.trim() ||
    activeAccount?.displayName?.trim() ||
    activeAccount?.userId.replace(/^@/, '').split(':')[0] ||
    'Account';
  const avatarMxc = profile.avatarMxc ?? activeAccount?.avatarUrl ?? null;
  const fallbackInitial = accountLabel.charAt(0).toUpperCase() || '?';

  return (
    <DialogPrimitive.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-40 bg-[var(--color-backdrop)] data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 transition-opacity duration-150" />
        <DialogPrimitive.Popup
          aria-label="Settings"
          className="fixed left-1/2 top-1/2 z-50 flex h-[80vh] w-[920px] -translate-x-1/2 -translate-y-1/2 border border-[var(--color-divider)] bg-[var(--color-panel)] outline-none data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 transition-opacity duration-150"
        >
          <DialogPrimitive.Title className="sr-only">Settings</DialogPrimitive.Title>

          <aside className="flex w-[220px] shrink-0 flex-col border-r border-[var(--color-divider)] bg-[var(--color-panel-2)]">
            <div className="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--color-divider)] px-3">
              <div className="h-6 w-6 shrink-0 overflow-hidden bg-[var(--color-surface)]">
                <AuthedImage
                  client={client}
                  mxc={avatarMxc}
                  width={24}
                  height={24}
                  className="h-full w-full object-cover"
                  fallback={
                    <span className="flex h-full w-full items-center justify-center text-[10px] font-semibold uppercase text-[var(--color-text-strong)]">
                      {fallbackInitial}
                    </span>
                  }
                />
              </div>
              <span className="truncate text-sm font-semibold text-[var(--color-text-strong)]">
                Settings
              </span>
            </div>

            <nav
              className="flex flex-1 flex-col gap-4 overflow-y-auto p-2"
              aria-label="Settings sections"
            >
              <TabGroup label="Client">
                {CLIENT_TABS.map((t) => (
                  <TabButton
                    key={t.id}
                    tab={t}
                    active={tab === t.id}
                    onClick={() => setTab(t.id)}
                  />
                ))}
              </TabGroup>
              <TabGroup label={accountLabel}>
                {ACCOUNT_TABS.map((t) => (
                  <TabButton
                    key={t.id}
                    tab={t}
                    active={tab === t.id}
                    onClick={() => setTab(t.id)}
                  />
                ))}
              </TabGroup>
            </nav>
          </aside>

          <main className="relative flex min-w-0 flex-1 flex-col">
            <DialogPrimitive.Close
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Close"
                  className="absolute right-2 top-2.5 z-10"
                />
              }
            >
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>

            {tab === 'general' && <GeneralPanel />}
            {tab === 'updates' && <UpdatesPanel />}
            {tab === 'account' && activeAccountId && (
              <AccountPanel accountId={activeAccountId} client={client} onSignedOut={onClose} />
            )}
            {tab === 'encryption' && (
              <EncryptionPanel accountId={activeAccountId} client={client} />
            )}
            {tab === 'devices' && <DevicesPanel client={client} onSasStart={trackSas} />}
          </main>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>

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
    </DialogPrimitive.Root>
  );
}

function TabGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-faint)]">
        {label}
      </div>
      {children}
    </div>
  );
}

function TabButton({
  tab,
  active,
  onClick,
}: {
  tab: TabDef;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = tab.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex h-8 items-center gap-2 px-2 text-left text-sm transition-colors',
        active
          ? 'bg-[var(--color-surface)] text-[var(--color-text-strong)]'
          : 'text-[var(--color-text-muted)] hover:bg-[var(--color-hover-overlay)] hover:text-[var(--color-text-strong)]',
      )}
    >
      <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
      <span className="truncate">{tab.label}</span>
    </button>
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
    <DialogPrimitive.Root
      open
      onOpenChange={(open) => {
        if (!open) void onDecline();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-[var(--color-backdrop-strong)]" />
        <DialogPrimitive.Popup
          aria-label="Incoming verification"
          className="fixed left-1/2 top-1/2 z-50 w-[360px] -translate-x-1/2 -translate-y-1/2 border border-[var(--color-divider)] bg-[var(--color-panel-2)] p-6 text-center outline-none"
        >
          <DialogPrimitive.Title className="mb-3 text-lg font-semibold">
            Incoming verification
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="mb-4 text-sm text-[var(--color-text-muted)]">
            Another session wants to verify this one.
          </DialogPrimitive.Description>
          <div className="flex justify-center gap-2">
            <Button variant="secondary" onClick={onDecline}>
              Decline
            </Button>
            <Button onClick={onAccept}>Accept</Button>
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
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
    <DialogPrimitive.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-[var(--color-backdrop-strong)]" />
        <DialogPrimitive.Popup
          aria-label="Compare emojis"
          className="fixed left-1/2 top-1/2 z-50 w-[460px] -translate-x-1/2 -translate-y-1/2 border border-[var(--color-divider)] bg-[var(--color-panel-2)] p-6 text-center outline-none"
        >
          <DialogPrimitive.Title className="mb-1 text-lg font-semibold">
            Compare emojis
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="mb-4 text-sm text-[var(--color-text-muted)]">
            Both devices should show the same emojis in the same order.
          </DialogPrimitive.Description>
          <div className="mb-4 flex flex-wrap justify-center gap-3">
            {handle.emoji.map(([emoji, label]) => (
              <div key={label} className="w-16">
                <div className="text-3xl">{emoji}</div>
                <div className="text-xs text-[var(--color-text-muted)]">{label}</div>
              </div>
            ))}
          </div>
          <div className="flex justify-center gap-2">
            <Button
              className="bg-red-600 text-white hover:bg-red-500"
              onClick={async () => {
                await handle.mismatch();
                onClose();
              }}
            >
              They don’t match
            </Button>
            <Button
              onClick={async () => {
                await handle.confirm();
              }}
            >
              They match
            </Button>
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

