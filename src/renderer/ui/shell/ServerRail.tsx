import { Home, Plus, Settings } from 'lucide-react';
import type { MatrixClient } from 'matrix-js-sdk';
import { cn } from '@/lib/utils';
import { useAccountsStore } from '@/state/accounts';
import { useRoomsStore, type RoomSummary } from '@/state/rooms';
import { useUiStore } from '@/state/ui';
import { accountManager } from '@/matrix/AccountManager';
import { AuthedImage } from '@/lib/mxc';
import { getTopLevelSpaces } from '@/lib/spaces';

export function ServerRail() {
  const accounts = useAccountsStore((s) => s.accounts);
  const activeAccountId = useAccountsStore((s) => s.activeAccountId);
  const activeSpaceId = useAccountsStore((s) => s.activeSpaceId);
  const setActiveAccount = useAccountsStore((s) => s.setActiveAccount);
  const setActiveSpace = useAccountsStore((s) => s.setActiveSpace);
  const byAccount = useRoomsStore((s) => s.byAccount);
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen);
  const setLoginAnotherOpen = useUiStore((s) => s.setLoginAnotherOpen);

  const accountList = Object.values(accounts);

  return (
    <nav
      className="flex h-full w-[72px] shrink-0 flex-col items-center gap-2 bg-[var(--color-rail)] py-3"
      aria-label="Accounts and spaces"
    >
      <div className="flex flex-1 flex-col items-center gap-2 overflow-y-auto">
        {accountList.map((account, idx) => {
          const client = accountManager.getClient(account.id);
          if (!client) return null;
          const accountRooms = byAccount[account.id] ?? [];
          const topSpaces = getTopLevelSpaces(accountRooms);
          const isActiveAccount = activeAccountId === account.id;
          return (
            <div key={account.id} className="flex flex-col items-center gap-2">
              {idx > 0 && <RailDivider />}
              <HomeButton
                displayName={account.displayName ?? account.userId}
                active={isActiveAccount && activeSpaceId === null}
                onClick={() => {
                  setActiveAccount(account.id);
                  setActiveSpace(null);
                }}
              />
              {topSpaces.length > 0 && <RailDivider short />}
              {topSpaces.map((space) => (
                <SpaceButton
                  key={space.roomId}
                  space={space}
                  client={client}
                  active={isActiveAccount && activeSpaceId === space.roomId}
                  onClick={() => {
                    setActiveAccount(account.id);
                    setActiveSpace(
                      isActiveAccount && activeSpaceId === space.roomId ? null : space.roomId,
                    );
                  }}
                />
              ))}
            </div>
          );
        })}
        <RailDivider />
        <RailIconButton
          label="Add account"
          onClick={() => setLoginAnotherOpen(true)}
          icon={<Plus className="h-5 w-5" />}
        />
      </div>
      <div className="flex flex-col items-center gap-2">
        <RailIconButton
          label="Settings"
          onClick={() => setSettingsOpen(true)}
          icon={<Settings className="h-5 w-5" />}
        />
      </div>
    </nav>
  );
}

function HomeButton({
  displayName,
  active,
  onClick,
}: {
  displayName: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <div className="relative flex items-center">
      <ActivePill visible={active} />
      <button
        type="button"
        onClick={onClick}
        title={`Direct messages (${displayName})`}
        aria-label={`Home — direct messages for ${displayName}`}
        className={cn(
          'group flex h-12 w-12 items-center justify-center rounded-2xl transition-all duration-150 hover:rounded-xl',
          active
            ? 'rounded-xl bg-[var(--color-accent)] text-white'
            : 'bg-[var(--color-panel)] text-[var(--color-text-muted)] hover:bg-[var(--color-accent)] hover:text-white',
        )}
      >
        <Home className="h-5 w-5" />
      </button>
    </div>
  );
}

function SpaceButton({
  space,
  client,
  active,
  onClick,
}: {
  space: RoomSummary;
  client: MatrixClient;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <div className="relative flex items-center">
      <ActivePill visible={active} />
      <button
        type="button"
        onClick={onClick}
        title={space.name}
        aria-label={space.name}
        className={cn(
          'group relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl transition-all duration-150 hover:rounded-xl',
          active
            ? 'rounded-xl ring-2 ring-[var(--color-accent)]'
            : 'bg-[var(--color-panel)] text-[var(--color-text-muted)] hover:bg-[var(--color-accent)] hover:text-white',
        )}
      >
        <AuthedImage
          client={client}
          mxc={space.avatarMxc}
          width={48}
          height={48}
          className="h-full w-full object-cover"
          fallback={
            <span className="flex h-full w-full items-center justify-center font-semibold">
              {initialFrom(space.name)}
            </span>
          }
        />
      </button>
    </div>
  );
}

function ActivePill({ visible }: { visible: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'absolute left-0 w-1 rounded-r bg-[var(--color-text-strong)] transition-all duration-150',
        visible ? 'h-8' : 'h-0',
      )}
      style={{ transform: 'translateX(-12px)' }}
    />
  );
}

function RailDivider({ short = false }: { short?: boolean }) {
  return (
    <div
      aria-hidden
      className={cn(
        'mx-auto rounded-full bg-[var(--color-divider)]',
        short ? 'h-px w-6 opacity-60' : 'h-0.5 w-8',
      )}
    />
  );
}

function RailIconButton({
  label,
  onClick,
  icon,
}: {
  label: string;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--color-rail-hover)] text-[var(--color-text-muted)] transition-all duration-150 hover:rounded-xl hover:bg-[var(--color-accent)] hover:text-white"
    >
      {icon}
    </button>
  );
}

function initialFrom(name: string): string {
  return name.replace(/^[#@]/, '').charAt(0).toUpperCase() || '?';
}
