import { Settings } from 'lucide-react';
import { SyncState } from 'matrix-js-sdk';
import { cn } from '@/lib/utils';
import { useAccountsStore } from '@/state/accounts';
import { useUiStore } from '@/state/ui';
import { accountManager } from '@/matrix/AccountManager';
import { AuthedImage } from '@/lib/mxc';

export function UserPanel() {
  const activeAccountId = useAccountsStore((s) => s.activeAccountId);
  const account = useAccountsStore((s) =>
    activeAccountId ? s.accounts[activeAccountId] : null,
  );
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen);

  const client = activeAccountId ? accountManager.getClient(activeAccountId) : null;

  const display = account?.displayName || account?.userId || 'Not signed in';
  const subline = account?.userId ?? '';
  const { color, label } = statusIndicator(account?.syncState);

  return (
    <div className="flex h-12 shrink-0 items-center gap-2 border-t border-[var(--color-divider)] bg-[var(--color-panel-2)] px-2">
      <div className="relative h-8 w-8 shrink-0">
        <AuthedImage
          client={client}
          mxc={account?.avatarUrl}
          width={32}
          height={32}
          className="h-8 w-8 rounded-full bg-[var(--color-surface)] object-cover"
          fallback={<InitialBadge text={display} />}
        />
        <span
          title={label}
          className={cn(
            'absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-[var(--color-panel-2)]',
            color,
          )}
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-semibold text-[var(--color-text-strong)]">
          {display}
        </span>
        {subline && account?.displayName && (
          <span className="truncate text-[11px] text-[var(--color-text-muted)]">
            {subline}
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={() => setSettingsOpen(true)}
        title="User settings"
        className="rounded p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-hover-overlay)] hover:text-[var(--color-text-strong)]"
      >
        <Settings className="h-4 w-4" />
      </button>
    </div>
  );
}

function InitialBadge({ text }: { text: string }) {
  const initial = text.replace(/^@/, '').charAt(0).toUpperCase() || '?';
  return (
    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-accent)] text-sm font-semibold text-white">
      {initial}
    </span>
  );
}

function statusIndicator(state: SyncState | undefined | null): {
  color: string;
  label: string;
} {
  switch (state) {
    case SyncState.Prepared:
    case SyncState.Syncing:
      return { color: 'bg-emerald-500', label: 'Online' };
    case SyncState.Reconnecting:
    case SyncState.Catchup:
      return { color: 'bg-amber-500', label: 'Reconnecting' };
    case SyncState.Error:
    case SyncState.Stopped:
      return { color: 'bg-red-500', label: 'Error' };
    default:
      return { color: 'bg-zinc-500', label: 'Idle' };
  }
}
