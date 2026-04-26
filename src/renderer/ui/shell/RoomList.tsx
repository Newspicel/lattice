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

  const homeRooms = useMemo(
    () => (activeSpaceId ? [] : getHomeRooms(allRooms)),
    [allRooms, activeSpaceId],
  );

  const viewKey = activeAccountId ? viewKeyFor(activeAccountId, activeSpaceId) : null;

  // Pick a default room when entering a view that has none selected. Prefer
  // the last-selected room for this view if it still exists; otherwise the
  // first available room.
  useEffect(() => {
    if (!activeAccountId || !viewKey) return;
    if (activeRoomId) return;
    const candidateIds = activeSpace
      ? flattenSpaceRoomIds(allRooms, activeSpace)
      : homeRooms.map((r) => r.roomId);
    if (candidateIds.length === 0) return;
    const remembered = lastRoomByView[viewKey];
    const pick =
      remembered && candidateIds.includes(remembered) ? remembered : candidateIds[0];
    setActiveRoom(pick);
  }, [activeAccountId, viewKey, activeRoomId, activeSpace, allRooms, homeRooms, lastRoomByView, setActiveRoom]);

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
            rooms={homeRooms}
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

function getHomeRooms(rooms: RoomSummary[]): RoomSummary[] {
  const dms = rooms.filter((r) => !r.isSpace && r.isDirect);
  const orphans = getOrphanRooms(rooms);
  const merged = [...dms, ...orphans];
  merged.sort((a, b) => b.lastActivity - a.lastActivity);
  return merged;
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
  rooms,
  activeRoomId,
  onSelect,
  client,
}: {
  rooms: RoomSummary[];
  activeRoomId: string | null;
  onSelect: (roomId: string) => void;
  client: MatrixClient | null;
}) {
  if (rooms.length === 0) {
    return (
      <p className="px-2 pt-4 text-xs italic text-[var(--color-text-faint)]">
        No direct messages yet.
      </p>
    );
  }

  return (
    <div>
      <div className="px-2 pt-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
        Direct messages
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
