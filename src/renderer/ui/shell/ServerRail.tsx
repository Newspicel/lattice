import { Home, Plus } from 'lucide-react';
import { SyncState, type MatrixClient } from 'matrix-js-sdk';
import { cn } from '@/lib/utils';
import { useAccountsStore } from '@/state/accounts';
import { useRoomsStore, type RoomSummary } from '@/state/rooms';
import { useUiStore } from '@/state/ui';
import { accountManager } from '@/matrix/AccountManager';
import { AuthedImage } from '@/lib/mxc';
import { useOwnProfile } from '@/lib/profile';
import { getTopLevelSpaces } from '@/lib/spaces';
import type { AccountMetadata } from '@shared/types';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/primitives/tooltip';

// The accounts store augments AccountMetadata with the live MatrixClient
// sync state so the rail can paint a presence dot. Mirror that shape here
// rather than re-exporting it from the store.
type AccountWithSync = AccountMetadata & { syncState?: SyncState };

interface AccountNotifs {
  unread: number;
  highlights: number;
}

function notifsFor(rooms: RoomSummary[] | undefined): AccountNotifs {
  if (!rooms) return { unread: 0, highlights: 0 };
  let unread = 0;
  let highlights = 0;
  for (const r of rooms) {
    if (r.isSpace) continue;
    unread += r.unread;
    highlights += r.highlights;
  }
  return { unread, highlights };
}

export function ServerRail() {
  const accounts = useAccountsStore((s) => s.accounts);
  const activeAccountId = useAccountsStore((s) => s.activeAccountId);
  const activeSpaceId = useAccountsStore((s) => s.activeSpaceId);
  const setActiveAccount = useAccountsStore((s) => s.setActiveAccount);
  const setActiveSpace = useAccountsStore((s) => s.setActiveSpace);
  const byAccount = useRoomsStore((s) => s.byAccount);
  const setLoginAnotherOpen = useUiStore((s) => s.setLoginAnotherOpen);

  const accountList = Object.values(accounts);
  const activeAccount = activeAccountId ? accounts[activeAccountId] : null;
  const activeClient = (activeAccountId ? accountManager.getClient(activeAccountId) : null) ?? null;
  const activeRooms = activeAccountId ? byAccount[activeAccountId] ?? [] : [];
  const topSpaces = getTopLevelSpaces(activeRooms);

  const otherAccounts = accountList.filter((a) => a.id !== activeAccountId);

  return (
    <nav
      className="flex h-full w-[60px] shrink-0 flex-col items-stretch border-r border-[var(--color-divider)] bg-[var(--color-rail)]"
      aria-label="Accounts and spaces"
    >
      <div className="flex flex-1 flex-col items-stretch gap-0.5 overflow-y-auto py-2">
        {activeAccount && (
          <HomeButton
            account={activeAccount}
            active={activeSpaceId === null}
            onClick={() => {
              setActiveAccount(activeAccount.id);
              setActiveSpace(null);
            }}
          />
        )}
        {topSpaces.length > 0 && <RailDivider />}
        {topSpaces.map((space) => (
          <SpaceButton
            key={space.roomId}
            space={space}
            client={activeClient}
            active={activeSpaceId === space.roomId}
            onClick={() => {
              setActiveSpace(activeSpaceId === space.roomId ? null : space.roomId);
            }}
          />
        ))}
        {otherAccounts.length > 0 && <RailDivider />}
        {otherAccounts.map((account) => {
          const client = accountManager.getClient(account.id);
          if (!client) return null;
          return (
            <AccountButton
              key={account.id}
              account={account}
              client={client}
              notifs={notifsFor(byAccount[account.id])}
              onClick={() => setActiveAccount(account.id)}
            />
          );
        })}
        <RailIconButton
          label="Add account"
          onClick={() => setLoginAnotherOpen(true)}
          icon={<Plus className="h-4 w-4" />}
        />
      </div>
      {activeAccount && (
        <div className="flex shrink-0 flex-col items-stretch border-t border-[var(--color-divider)]">
          <ProfileButton account={activeAccount} client={activeClient} />
        </div>
      )}
    </nav>
  );
}

function ProfileButton({
  account,
  client,
}: {
  account: AccountWithSync;
  client: MatrixClient | null;
}) {
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen);
  const profile = useOwnProfile(client, account.userId);
  const primary =
    profile.displayName?.trim() ||
    account.displayName?.trim() ||
    account.userId.replace(/^@/, '').split(':')[0] ||
    'Settings';
  const avatarMxc = profile.avatarMxc ?? account.avatarUrl ?? null;
  const { color, label } = statusIndicator(account.syncState);

  return (
    <div className="flex h-12 items-center justify-center">
      <RailTooltip label={`${primary} — Open settings`}>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          aria-label="Open settings"
          className="group relative flex h-9 w-9 items-center justify-center overflow-hidden text-[var(--color-text-muted)] transition-opacity duration-150 hover:opacity-80"
        >
          <AuthedImage
            client={client}
            mxc={avatarMxc}
            width={36}
            height={36}
            className="h-full w-full object-cover"
            fallback={
              <span className="flex h-full w-full items-center justify-center bg-[var(--color-surface)] text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-strong)]">
                {initialFrom(primary)}
              </span>
            }
          />
          <span
            title={label}
            aria-hidden
            className={cn(
              'absolute -bottom-px -right-px h-2 w-2 ring-2 ring-[var(--color-rail)]',
              color,
            )}
          />
        </button>
      </RailTooltip>
    </div>
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

function RailTooltip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-block" />}>{children}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

function HomeButton({
  account,
  active,
  onClick,
}: {
  account: AccountMetadata;
  active: boolean;
  onClick: () => void;
}) {
  const label = `Direct messages (${account.displayName ?? account.userId})`;
  return (
    <RailItem active={active}>
      <RailTooltip label={label}>
        <button
          type="button"
          onClick={onClick}
          aria-label={label}
          className={cn(
            'group flex h-10 w-10 items-center justify-center transition-colors duration-150',
            active
              ? 'bg-[var(--color-text-strong)] text-[var(--color-bg)]'
              : 'text-[var(--color-text-muted)] hover:bg-[var(--color-hover-overlay)] hover:text-[var(--color-text-strong)]',
          )}
        >
          <Home className="h-4 w-4" strokeWidth={1.75} />
        </button>
      </RailTooltip>
    </RailItem>
  );
}

function SpaceButton({
  space,
  client,
  active,
  onClick,
}: {
  space: RoomSummary;
  client: MatrixClient | null;
  active: boolean;
  onClick: () => void;
}) {
  const hasNotif = space.highlights > 0 || space.unread > 0;
  return (
    <RailItem active={active} unread={hasNotif && !active}>
      <RailTooltip label={space.name}>
        <button
          type="button"
          onClick={onClick}
          aria-label={space.name}
          className={cn(
            'group relative flex h-10 w-10 items-center justify-center overflow-hidden text-[var(--color-text-muted)] transition-all duration-150',
            active
              ? 'ring-2 ring-inset ring-[var(--color-text-strong)]'
              : 'opacity-80 hover:opacity-100',
          )}
        >
          <AuthedImage
            client={client}
            mxc={space.avatarMxc}
            width={40}
            height={40}
            className="h-full w-full object-cover"
            fallback={
              <span className="flex h-full w-full items-center justify-center bg-[var(--color-surface)] text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-strong)]">
                {initialFrom(space.name)}
              </span>
            }
          />
        </button>
      </RailTooltip>
      {space.highlights > 0 && <RailHighlightBadge count={space.highlights} />}
    </RailItem>
  );
}

function AccountButton({
  account,
  client,
  notifs,
  onClick,
}: {
  account: AccountMetadata;
  client: MatrixClient;
  notifs: AccountNotifs;
  onClick: () => void;
}) {
  const profile = useOwnProfile(client, account.userId);
  const hasUnread = notifs.unread > 0 || notifs.highlights > 0;
  const label = profile.displayName ?? account.displayName ?? account.userId;
  const avatarMxc = profile.avatarMxc ?? account.avatarUrl ?? null;
  return (
    <RailItem active={false} unread={hasUnread}>
      <RailTooltip label={`Switch to ${label}`}>
        <button
          type="button"
          onClick={onClick}
          aria-label={`Switch to ${label}`}
          className="group relative flex h-10 w-10 items-center justify-center overflow-hidden text-[var(--color-text-muted)] opacity-70 transition-opacity duration-150 hover:opacity-100"
        >
          <AuthedImage
            client={client}
            mxc={avatarMxc}
            width={40}
            height={40}
            className="h-full w-full object-cover"
            fallback={
              <span className="flex h-full w-full items-center justify-center bg-[var(--color-surface)] text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-strong)]">
                {initialFrom(label)}
              </span>
            }
          />
        </button>
      </RailTooltip>
      {notifs.highlights > 0 && <RailHighlightBadge count={notifs.highlights} />}
    </RailItem>
  );
}

function RailItem({
  active,
  unread,
  children,
}: {
  active: boolean;
  unread?: boolean;
  children: React.ReactNode;
}) {
  // 40px tile centered in the 60px rail. The active/unread pill sits flush
  // to the rail's left edge so it reads as a tab marker, not a chip.
  return (
    <div className="relative flex h-10 items-center justify-center">
      <ActivePill visible={active} unread={!!unread} />
      {children}
    </div>
  );
}

function ActivePill({ visible, unread }: { visible: boolean; unread: boolean }) {
  // Sharp 3px bar flush to the rail's left edge. Active runs the full tile
  // height; unread is a short stub so it reads as "has activity" not "is open".
  const height = visible ? 'h-8' : unread ? 'h-2' : 'h-0';
  return (
    <span
      aria-hidden
      className={cn(
        'absolute left-0 w-[3px] bg-[var(--color-text-strong)] transition-all duration-150',
        height,
      )}
    />
  );
}

function RailHighlightBadge({ count }: { count: number }) {
  // Square corner mark — the rectilinear analogue of the previous round
  // badge. Sits in the bottom-right of the 44px tile.
  return (
    <span className="pointer-events-none absolute bottom-1 right-1 flex h-3.5 min-w-3.5 items-center justify-center bg-red-500 px-1 text-[9px] font-bold text-white">
      {count > 9 ? '9+' : count}
    </span>
  );
}

function RailDivider() {
  // Short hairline divider centered horizontally — keeps the rail edges
  // clean and reads as a section break rather than a hard rule.
  return (
    <div aria-hidden className="my-1.5 flex justify-center">
      <span className="h-px w-6 bg-[var(--color-divider)]" />
    </div>
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
    <RailItem active={false}>
      <RailTooltip label={label}>
        <button
          type="button"
          onClick={onClick}
          aria-label={label}
          className="flex h-10 w-10 items-center justify-center text-[var(--color-text-faint)] transition-colors duration-150 hover:bg-[var(--color-hover-overlay)] hover:text-[var(--color-text-strong)]"
        >
          {icon}
        </button>
      </RailTooltip>
    </RailItem>
  );
}

function initialFrom(name: string): string {
  return name.replace(/^[#@]/, '').charAt(0).toUpperCase() || '?';
}
