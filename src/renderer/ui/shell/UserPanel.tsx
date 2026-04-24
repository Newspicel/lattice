import { Settings } from 'lucide-react';
import { useEffect, useState } from 'react';
import { SyncState, UserEvent, type MatrixClient, type User } from 'matrix-js-sdk';
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

  const userId = account?.userId ?? '';
  const mxLocalpart = userId.replace(/^@/, '').split(':')[0] ?? '';
  const profile = useOwnProfile(client ?? null, userId);
  const primary =
    profile.displayName?.trim() ||
    account?.displayName?.trim() ||
    mxLocalpart ||
    'Not signed in';
  const avatarMxc = profile.avatarMxc ?? account?.avatarUrl ?? null;
  const { color, label } = statusIndicator(account?.syncState);

  return (
    <div className="flex shrink-0 items-center gap-2 border-t border-[var(--color-divider)] px-4 py-3">
      <div className="relative h-8 w-8 shrink-0">
        <AuthedImage
          client={client}
          mxc={avatarMxc}
          width={32}
          height={32}
          className="h-8 w-8 rounded-full bg-[var(--color-surface)] object-cover"
          fallback={<InitialBadge text={primary} />}
        />
        <span
          title={label}
          className={cn(
            'absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-[var(--color-panel)]',
            color,
          )}
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="truncate text-sm font-semibold text-[var(--color-text-strong)]">
          {primary}
        </span>
        <span className="truncate text-[11px] text-[var(--color-text-muted)]">
          {userId || 'Signed out'}
        </span>
      </div>
      <button
        type="button"
        onClick={() => setSettingsOpen(true)}
        title="User settings"
        aria-label="User settings"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-hover-overlay)] hover:text-[var(--color-text-strong)]"
      >
        <Settings className="h-4 w-4" />
      </button>
    </div>
  );
}

interface OwnProfile {
  displayName: string | null;
  avatarMxc: string | null;
}

function readProfile(client: MatrixClient, userId: string): OwnProfile {
  const user = client.getUser(userId);
  return {
    displayName: user?.displayName ?? null,
    avatarMxc: user?.avatarUrl ?? null,
  };
}

function useOwnProfile(client: MatrixClient | null, userId: string): OwnProfile {
  const [profile, setProfile] = useState<OwnProfile>({
    displayName: null,
    avatarMxc: null,
  });

  useEffect(() => {
    if (!client || !userId) {
      setProfile({ displayName: null, avatarMxc: null });
      return;
    }

    setProfile(readProfile(client, userId));

    let cancelled = false;
    if (!client.getUser(userId)?.avatarUrl) {
      client
        .getProfileInfo(userId)
        .then((info) => {
          if (cancelled) return;
          setProfile((prev) => ({
            displayName: info?.displayname ?? prev.displayName,
            avatarMxc: info?.avatar_url ?? prev.avatarMxc,
          }));
        })
        .catch(() => {});
    }

    const onChange = (_event: unknown, user: User) => {
      if (user.userId !== userId) return;
      setProfile(readProfile(client, userId));
    };
    client.on(UserEvent.DisplayName, onChange);
    client.on(UserEvent.AvatarUrl, onChange);
    return () => {
      cancelled = true;
      client.off(UserEvent.DisplayName, onChange);
      client.off(UserEvent.AvatarUrl, onChange);
    };
  }, [client, userId]);

  return profile;
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
