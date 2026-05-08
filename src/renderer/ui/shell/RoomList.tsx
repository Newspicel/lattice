import { useEffect, useMemo } from 'react';
import type { MatrixClient } from 'matrix-js-sdk';
import { toast } from 'sonner';
import {
  CheckCheck,
  FolderPlus,
  Hash,
  Link2,
  LogOut,
  MessageSquarePlus,
  MoreVertical,
  Plus,
  Settings as SettingsIcon,
  UserPlus,
} from 'lucide-react';
import { useAccountsStore } from '@/state/accounts';
import { useRoomsStore, type RoomSummary } from '@/state/rooms';
import { accountManager } from '@/matrix/AccountManager';
import {
  buildRoomPermalink,
  leaveRoom,
  markSpaceAsRead,
} from '@/matrix/roomOps';
import { getOrphanRooms, getSpaceTree, LOBBY_ROOM_ID } from '@/lib/spaces';
import { getSpacePermissions } from '@/lib/powerLevels';
import { RoomRow, SpaceTree } from '@/ui/shell/SpaceTree';
import { HomeserverStatus } from '@/ui/shell/HomeserverStatus';
import { useUiStore, viewKeyFor } from '@/state/ui';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/ui/primitives/dropdown-menu';

const EMPTY_ROOMS: RoomSummary[] = [];

export function RoomList() {
  const activeAccountId = useAccountsStore((s) => s.activeAccountId);
  const activeRoomId = useAccountsStore((s) => s.activeRoomId);
  const activeSpaceId = useAccountsStore((s) => s.activeSpaceId);
  const allRooms = useRoomsStore((s) =>
    activeAccountId ? (s.byAccount[activeAccountId] ?? EMPTY_ROOMS) : EMPTY_ROOMS,
  );
  const setActiveRoom = useAccountsStore((s) => s.setActiveRoom);
  const lastRoomByView = useUiStore((s) => s.lastRoomByView);
  const rememberRoomForView = useUiStore((s) => s.rememberRoomForView);
  const client: MatrixClient | null =
    (activeAccountId ? accountManager.getClient(activeAccountId) : null) ?? null;

  const activeSpace = useMemo(
    () =>
      activeSpaceId ? allRooms.find((r) => r.roomId === activeSpaceId) ?? null : null,
    [allRooms, activeSpaceId],
  );

  const homeDms = useMemo(
    () => (activeSpaceId ? [] : getHomeDms(allRooms)),
    [allRooms, activeSpaceId],
  );
  const homeOrphans = useMemo(
    () => (activeSpaceId ? [] : getHomeOrphans(allRooms)),
    [allRooms, activeSpaceId],
  );
  const dmRequests = useMemo(
    () => (activeSpaceId ? [] : getDmRequests(allRooms)),
    [allRooms, activeSpaceId],
  );

  const viewKey = activeAccountId ? viewKeyFor(activeAccountId, activeSpaceId) : null;

  // Pick a default room when entering a view that has none selected. Prefer
  // the last-selected room for this view if it still exists; otherwise the
  // first available room. Requests are eligible too — auto-selecting one
  // surfaces the accept/decline UI without an extra click.
  useEffect(() => {
    if (!activeAccountId || !viewKey) return;
    if (activeRoomId) return;
    if (activeSpace) {
      // Inside a space: prefer the last-visited room (including the lobby
      // sentinel) if it still exists; otherwise default to the lobby so new
      // visitors land on the overview rather than a random room.
      const candidateIds = flattenSpaceRoomIds(allRooms, activeSpace);
      const remembered = lastRoomByView[viewKey];
      const pick =
        remembered && (remembered === LOBBY_ROOM_ID || candidateIds.includes(remembered))
          ? remembered
          : LOBBY_ROOM_ID;
      setActiveRoom(pick);
      return;
    }
    const candidateIds = [...homeDms, ...homeOrphans, ...dmRequests].map((r) => r.roomId);
    if (candidateIds.length === 0) return;
    const remembered = lastRoomByView[viewKey];
    const pick =
      remembered && candidateIds.includes(remembered) ? remembered : candidateIds[0];
    setActiveRoom(pick);
  }, [activeAccountId, viewKey, activeRoomId, activeSpace, allRooms, homeDms, homeOrphans, dmRequests, lastRoomByView, setActiveRoom]);

  useEffect(() => {
    if (viewKey && activeRoomId) rememberRoomForView(viewKey, activeRoomId);
  }, [viewKey, activeRoomId, rememberRoomForView]);

  return (
    <aside
      className="flex h-full w-64 shrink-0 flex-col border-r border-[var(--color-divider)] bg-[var(--color-panel)] text-sm"
      aria-label="Room list"
    >
      <header className="flex h-12 shrink-0 items-center gap-1 border-b border-[var(--color-divider)] px-4 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-strong)]">
        <span className="min-w-0 flex-1 truncate">
          {activeSpace ? activeSpace.name : 'Direct Messages'}
        </span>
        <RoomListActions activeSpace={activeSpace} />
      </header>
      <div className="flex-1 overflow-y-auto p-1.5">
        {activeSpace ? (
          <SpaceTree
            space={activeSpace}
            rooms={allRooms}
            activeRoomId={activeRoomId}
            onSelect={setActiveRoom}
            client={client}
          />
        ) : (
          <HomeView
            dms={homeDms}
            orphans={homeOrphans}
            requests={dmRequests}
            activeRoomId={activeRoomId}
            onSelect={setActiveRoom}
            client={client}
          />
        )}
      </div>
      <HomeserverStatus />
    </aside>
  );
}

function RoomListActions({ activeSpace }: { activeSpace: RoomSummary | null }) {
  if (activeSpace) return <SpaceMenu space={activeSpace} />;
  return <HomeMenu />;
}

function HomeMenu() {
  const setStartDmOpen = useUiStore((s) => s.setStartDmOpen);
  const setCreateRoomOpen = useUiStore((s) => s.setCreateRoomOpen);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-hover-overlay)] hover:text-[var(--color-text-strong)] aria-expanded:bg-[var(--color-hover-overlay)] aria-expanded:text-[var(--color-text-strong)]"
            title="New chat"
            aria-label="New chat"
          />
        }
      >
        <Plus className="h-4 w-4" strokeWidth={1.75} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={4} className="min-w-56">
        <DropdownMenuItem onClick={() => setStartDmOpen(true)}>
          <MessageSquarePlus />
          <span className="whitespace-nowrap">Start direct message</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setCreateRoomOpen({ parentSpaceId: null })}>
          <Hash />
          <span className="whitespace-nowrap">Create room</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SpaceMenu({ space }: { space: RoomSummary }) {
  const activeAccountId = useAccountsStore((s) => s.activeAccountId);
  const setActiveSpace = useAccountsStore((s) => s.setActiveSpace);
  const setActiveRoom = useAccountsStore((s) => s.setActiveRoom);
  const setCreateRoomOpen = useUiStore((s) => s.setCreateRoomOpen);
  const setCreateSpaceOpen = useUiStore((s) => s.setCreateSpaceOpen);
  const setSpaceSettingsForId = useUiStore((s) => s.setSpaceSettingsForId);
  const setInviteForRoomId = useUiStore((s) => s.setInviteForRoomId);
  const allRooms = useRoomsStore((s) =>
    activeAccountId ? s.byAccount[activeAccountId] ?? [] : [],
  );

  const client: MatrixClient | null =
    (activeAccountId ? accountManager.getClient(activeAccountId) : null) ?? null;

  // Re-evaluate on each render so power-level changes (which trigger a rooms
  // refresh) take effect without extra subscriptions. Falls back to "no perms"
  // when the client isn't ready yet.
  const perms = client
    ? getSpacePermissions(client, space.roomId)
    : { canInvite: false, canManageChildren: false, canEditProfile: false };

  async function onMarkSpaceRead() {
    if (!client) return;
    try {
      const tree = getSpaceTree(allRooms, space.roomId);
      const childIds = [
        ...tree.directRooms.map((r) => r.roomId),
        ...tree.subspaces.flatMap((sub) => [sub.space.roomId, ...sub.rooms.map((r) => r.roomId)]),
      ];
      await markSpaceAsRead(client, space.roomId, childIds);
      toast.success('Space marked as read.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  async function onCopyLink() {
    if (!client) return;
    try {
      const link = buildRoomPermalink(client, space.roomId);
      await navigator.clipboard.writeText(link);
      toast.success('Space link copied.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  async function onLeave() {
    if (!client) return;
    if (!confirm(`Leave "${space.name}"? Rooms inside the space stay joined.`)) return;
    try {
      await leaveRoom(client, space.roomId);
      setActiveSpace(null);
      setActiveRoom(null);
      toast.success(`Left ${space.name}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-hover-overlay)] hover:text-[var(--color-text-strong)] aria-expanded:bg-[var(--color-hover-overlay)] aria-expanded:text-[var(--color-text-strong)]"
            title="Space actions"
            aria-label="Space actions"
          />
        }
      >
        <MoreVertical className="h-4 w-4" strokeWidth={1.75} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={4} className="min-w-56">
        <DropdownMenuItem onClick={onMarkSpaceRead}>
          <CheckCheck />
          <span className="whitespace-nowrap">Mark as read</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {perms.canInvite && (
          <DropdownMenuItem onClick={() => setInviteForRoomId(space.roomId)}>
            <UserPlus />
            <span className="whitespace-nowrap">Invite</span>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={onCopyLink}>
          <Link2 />
          <span className="whitespace-nowrap">Copy link</span>
        </DropdownMenuItem>
        {perms.canManageChildren && (
          <>
            <DropdownMenuItem
              onClick={() => setCreateRoomOpen({ parentSpaceId: space.roomId })}
            >
              <Hash />
              <span className="whitespace-nowrap">Add room</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setCreateSpaceOpen({ parentSpaceId: space.roomId })}
            >
              <FolderPlus />
              <span className="whitespace-nowrap">Add category</span>
            </DropdownMenuItem>
          </>
        )}
        {perms.canEditProfile && (
          <DropdownMenuItem onClick={() => setSpaceSettingsForId(space.roomId)}>
            <SettingsIcon />
            <span className="whitespace-nowrap">Space settings</span>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={onLeave}>
          <LogOut />
          <span className="whitespace-nowrap">Leave space</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function getHomeDms(rooms: RoomSummary[]): RoomSummary[] {
  const dms = rooms.filter((r) => !r.isSpace && r.isDirect && !r.isInvite);
  dms.sort((a, b) => b.lastActivity - a.lastActivity);
  return dms;
}

function getHomeOrphans(rooms: RoomSummary[]): RoomSummary[] {
  const orphans = getOrphanRooms(rooms).filter((r) => !r.isInvite);
  orphans.sort((a, b) => b.lastActivity - a.lastActivity);
  return orphans;
}

function getDmRequests(rooms: RoomSummary[]): RoomSummary[] {
  const requests = rooms.filter((r) => !r.isSpace && r.isDirect && r.isInvite);
  requests.sort((a, b) => b.lastActivity - a.lastActivity);
  return requests;
}

function flattenSpaceRoomIds(rooms: RoomSummary[], space: RoomSummary): string[] {
  const tree = getSpaceTree(rooms, space.roomId);
  const ids: string[] = tree.directRooms.map((r) => r.roomId);
  for (const sub of tree.subspaces) {
    for (const r of sub.rooms) ids.push(r.roomId);
  }
  return ids;
}

function HomeView({
  dms,
  orphans,
  requests,
  activeRoomId,
  onSelect,
  client,
}: {
  dms: RoomSummary[];
  orphans: RoomSummary[];
  requests: RoomSummary[];
  activeRoomId: string | null;
  onSelect: (roomId: string) => void;
  client: MatrixClient | null;
}) {
  if (dms.length === 0 && orphans.length === 0 && requests.length === 0) {
    return (
      <p className="px-2 pt-4 text-xs italic text-[var(--color-text-faint)]">
        No direct messages yet.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {requests.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 px-2 pt-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
            <span>Requests</span>
            <span className="bg-[var(--color-text-muted)] px-1.5 text-[10px] font-bold text-[var(--color-panel)]">
              {requests.length}
            </span>
          </div>
          <ul className="space-y-px">
            {requests.map((r) => (
              <RoomRow
                key={r.roomId}
                room={r}
                active={r.roomId === activeRoomId}
                onClick={() => onSelect(r.roomId)}
                client={client}
              />
            ))}
          </ul>
        </div>
      )}
      {dms.length > 0 && (
        <RoomSection
          label="Direct messages"
          rooms={dms}
          activeRoomId={activeRoomId}
          onSelect={onSelect}
          client={client}
        />
      )}
      {orphans.length > 0 && (
        <RoomSection
          label="Rooms"
          rooms={orphans}
          activeRoomId={activeRoomId}
          onSelect={onSelect}
          client={client}
        />
      )}
    </div>
  );
}

function RoomSection({
  label,
  rooms,
  activeRoomId,
  onSelect,
  client,
}: {
  label: string;
  rooms: RoomSummary[];
  activeRoomId: string | null;
  onSelect: (roomId: string) => void;
  client: MatrixClient | null;
}) {
  return (
    <div>
      <div className="px-2 pt-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
        {label}
      </div>
      <ul className="space-y-px">
        {rooms.map((r) => (
          <RoomRow
            key={r.roomId}
            room={r}
            active={r.roomId === activeRoomId}
            onClick={() => onSelect(r.roomId)}
            client={client}
          />
        ))}
      </ul>
    </div>
  );
}
