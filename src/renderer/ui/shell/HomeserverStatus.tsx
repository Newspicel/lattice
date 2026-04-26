import { AlertCircle, CheckCircle2, CircleOff, Loader2 } from 'lucide-react';
import { SyncState } from 'matrix-js-sdk';
import { cn } from '@/lib/utils';
import { useAccountsStore } from '@/state/accounts';

type StatusTone = 'online' | 'reconnecting' | 'error' | 'idle';

interface StatusDescriptor {
  tone: StatusTone;
  label: string;
  text: string;
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  spin: boolean;
}

export function HomeserverStatus() {
  const activeAccountId = useAccountsStore((s) => s.activeAccountId);
  const account = useAccountsStore((s) =>
    activeAccountId ? s.accounts[activeAccountId] : null,
  );

  if (!account) return null;

  const status = describeStatus(account.syncState);
  const host = hostFromUrl(account.homeserverUrl);
  const tooltip = `${status.label} — ${host}`;

  return (
    <div
      role="status"
      aria-live="polite"
      title={tooltip}
      className="flex h-7 shrink-0 items-center gap-2 border-t border-[var(--color-divider)] bg-[var(--color-rail)] px-3 text-[11px]"
    >
      <status.Icon
        aria-hidden
        className={cn(
          'h-3 w-3 shrink-0',
          status.text,
          status.spin && 'animate-spin',
        )}
        strokeWidth={2}
      />
      <span
        className={cn(
          'shrink-0 font-semibold uppercase tracking-wider',
          status.text,
        )}
      >
        {status.label}
      </span>
      <span className="truncate text-[var(--color-text-muted)]">{host}</span>
    </div>
  );
}

function describeStatus(state: SyncState | undefined | null): StatusDescriptor {
  switch (state) {
    case SyncState.Prepared:
    case SyncState.Syncing:
      return {
        tone: 'online',
        label: 'Online',
        text: 'text-emerald-500',
        Icon: CheckCircle2,
        spin: false,
      };
    case SyncState.Reconnecting:
    case SyncState.Catchup:
      return {
        tone: 'reconnecting',
        label: 'Reconnecting',
        text: 'text-amber-500',
        Icon: Loader2,
        spin: true,
      };
    case SyncState.Error:
      return {
        tone: 'error',
        label: 'Connection error',
        text: 'text-red-500',
        Icon: AlertCircle,
        spin: false,
      };
    case SyncState.Stopped:
      return {
        tone: 'error',
        label: 'Disconnected',
        text: 'text-red-500',
        Icon: CircleOff,
        spin: false,
      };
    default:
      return {
        tone: 'idle',
        label: 'Connecting',
        text: 'text-zinc-400',
        Icon: Loader2,
        spin: true,
      };
  }
}

function hostFromUrl(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  }
}
