import { Hash, Plus, Settings } from 'lucide-react';
import type { MatrixClient } from 'matrix-js-sdk';
import { cn } from '@/lib/utils';
import { useAccountsStore } from '@/state/accounts';
import { useRoomsStore, type RoomSummary } from '@/state/rooms';
import { useUiStore } from '@/state/ui';
import { accountManager } from '@/matrix/AccountManager';
import { mxcToHttp } from '@/lib/mxc';

export function ServerRail() {
  const accounts = useAccountsStore((s) => s.accounts);
  const activeAccountId = useAccountsStore((s) => s.activeAccountId);
  const setActiveAccount = useAccountsStore((s) => s.setActiveAccount);
  const byAccount = useRoomsStore((s) => s.byAccount);
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen);
  const setLoginAnotherOpen = useUiStore((s) => s.setLoginAnotherOpen);

  const accountList = Object.values(accounts);

  return (
    <nav
      className="flex h-full w-[72px] shrink-0 flex-col items-center gap-2 bg-[var(--color-rail)] py-3 titlebar-drag"
      aria-label="Accounts and spaces"
    >
      <div className="flex flex-1 flex-col items-center gap-2 overflow-y-auto titlebar-no-drag">
        {accountList.map((account) => {
          const client = accountManager.getClient(account.id);
          if (!client) return null;
          const spaces = (byAccount[account.id] ?? []).filter((r) => r.isSpace);
          return (
            <AccountCluster
              key={account.id}
              accountId={account.id}
              userId={account.userId}
              displayName={account.displayName ?? account.userId}
              client={client}
              spaces={spaces}
              active={activeAccountId === account.id}
              onSelect={() => setActiveAccount(account.id)}
            />
          );
        })}
        <RailButton
          label="Add account"
          onClick={() => setLoginAnotherOpen(true)}
          variant="secondary"
          icon={<Plus className="h-5 w-5" />}
        />
      </div>
      <div className="flex flex-col items-center gap-2 titlebar-no-drag">
        <RailButton
          label="Settings"
          onClick={() => setSettingsOpen(true)}
          variant="secondary"
          icon={<Settings className="h-5 w-5" />}
        />
      </div>
    </nav>
  );
}

function AccountCluster({
  accountId,
  userId,
  displayName,
  client,
  spaces,
  active,
  onSelect,
}: {
  accountId: string;
  userId: string;
  displayName: string;
  client: MatrixClient;
  spaces: RoomSummary[];
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={onSelect}
        title={displayName}
        aria-label={displayName}
        className={cn(
          'group relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl transition-all duration-150 hover:rounded-xl',
          active
            ? 'ring-2 ring-[var(--color-accent)]'
            : 'bg-[var(--color-panel)] text-neutral-300 hover:bg-[var(--color-accent)] hover:text-white',
        )}
      >
        <InitialBadge text={displayName || userId} />
      </button>
      {active &&
        spaces.map((space) => (
          <SpaceButton key={space.roomId} space={space} accountId={accountId} client={client} />
        ))}
    </div>
  );
}

function SpaceButton({
  space,
  accountId,
  client,
}: {
  space: RoomSummary;
  accountId: string;
  client: MatrixClient;
}) {
  const setActiveAccount = useAccountsStore((s) => s.setActiveAccount);
  const setActiveSpace = useAccountsStore((s) => s.setActiveSpace);
  const activeSpaceId = useAccountsStore((s) => s.activeSpaceId);
  const avatar = mxcToHttp(client, space.avatarMxc, 48, 48);
  return (
    <button
      type="button"
      onClick={() => {
        setActiveAccount(accountId);
        setActiveSpace(activeSpaceId === space.roomId ? null : space.roomId);
      }}
      title={space.name}
      className="group relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-2xl bg-[var(--color-panel)] transition-all duration-150 hover:rounded-xl hover:bg-[var(--color-accent)]"
    >
      {avatar ? (
        // eslint-disable-next-line jsx-a11y/alt-text
        <img src={avatar} className="h-full w-full object-cover" />
      ) : (
        <Hash className="h-4 w-4 text-neutral-300" />
      )}
    </button>
  );
}

function InitialBadge({ text }: { text: string }) {
  const initial = text.replace(/^@/, '').charAt(0).toUpperCase();
  return (
    <span className="flex h-full w-full items-center justify-center bg-[var(--color-accent)] font-semibold text-white">
      {initial || '?'}
    </span>
  );
}

function RailButton({
  label,
  onClick,
  icon,
  variant = 'primary',
}: {
  label: string;
  onClick: () => void;
  icon: React.ReactNode;
  variant?: 'primary' | 'secondary';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        'flex h-12 w-12 items-center justify-center rounded-2xl transition-all duration-150 hover:rounded-xl',
        variant === 'secondary'
          ? 'bg-[var(--color-rail-hover)] text-neutral-300 hover:bg-[var(--color-accent)] hover:text-white'
          : 'bg-[var(--color-panel)] text-neutral-300 hover:bg-[var(--color-accent)] hover:text-white',
      )}
    >
      {icon}
    </button>
  );
}
