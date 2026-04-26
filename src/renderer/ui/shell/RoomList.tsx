import { useEffect, useMemo } from 'react';
import type { MatrixClient } from 'matrix-js-sdk';
import { useAccountsStore } from '@/state/accounts';
import { useRoomsStore, type RoomSummary } from '@/state/rooms';
import { accountManager } from '@/matrix/AccountManager';
import { getOrphanRooms, getSpaceTree } from '@/lib/spaces';
import { RoomRow, SpaceTree } from '@/ui/shell/SpaceTree';
import { HomeserverStatus } from '@/ui/shell/HomeserverStatus';
import { useUiStore, viewKeyFor } from '@/state/ui';

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
    const candidateIds = activeSpace
      ? flattenSpaceRoomIds(allRooms, activeSpace)
      : [...homeDms, ...homeOrphans, ...dmRequests].map((r) => r.roomId);
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
      <header className="flex h-12 shrink-0 items-center border-b border-[var(--color-divider)] px-4 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-strong)]">
        <span className="truncate">
          {activeSpace ? activeSpace.name : 'Direct Messages'}
        </span>
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
