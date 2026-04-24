import { Hash, Lock, Volume2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAccountsStore } from '@/state/accounts';
import { useRoomsStore, type RoomSummary } from '@/state/rooms';
import { accountManager } from '@/matrix/AccountManager';
import { mxcToHttp } from '@/lib/mxc';
import { useMemo } from 'react';

const EMPTY_ROOMS: RoomSummary[] = [];

export function RoomList() {
  const activeAccountId = useAccountsStore((s) => s.activeAccountId);
  const activeRoomId = useAccountsStore((s) => s.activeRoomId);
  const activeSpaceId = useAccountsStore((s) => s.activeSpaceId);
  const allRooms = useRoomsStore((s) =>
    activeAccountId ? (s.byAccount[activeAccountId] ?? EMPTY_ROOMS) : EMPTY_ROOMS,
  );
  const setActiveRoom = useAccountsStore((s) => s.setActiveRoom);
  const account = useAccountsStore((s) => (activeAccountId ? s.accounts[activeAccountId] : null));
  const client: import('matrix-js-sdk').MatrixClient | null =
    (activeAccountId ? accountManager.getClient(activeAccountId) : null) ?? null;

  // Space → direct children via m.space.child state events on the space room.
  const spaceChildren = useMemo<Set<string> | null>(() => {
    if (!activeSpaceId || !client) return null;
    const space = client.getRoom(activeSpaceId);
    if (!space) return null;
    const children = space.currentState
      .getStateEvents('m.space.child')
      .map((e) => e.getStateKey())
      .filter((k): k is string => !!k);
    return new Set(children);
  }, [activeSpaceId, client]);

  const rooms = useMemo(
    () =>
      allRooms.filter((r) => {
        if (r.isSpace) return false;
        if (spaceChildren) return spaceChildren.has(r.roomId);
        return true;
      }),
    [allRooms, spaceChildren],
  );

  const groups = useMemo(() => {
    const unread: RoomSummary[] = [];
    const dms: RoomSummary[] = [];
    const normal: RoomSummary[] = [];
    for (const r of rooms) {
      if (r.unread > 0 || r.highlights > 0) unread.push(r);
      else if (r.isDirect) dms.push(r);
      else normal.push(r);
    }
    return { unread, dms, normal };
  }, [rooms]);

  return (
    <aside
      className="flex h-full w-60 shrink-0 flex-col bg-[var(--color-panel)] text-sm"
      aria-label="Room list"
    >
      <header className="flex h-12 items-center border-b border-[var(--color-divider)] px-4 font-semibold shadow-sm titlebar-drag">
        {account?.displayName ?? account?.userId ?? 'Rooms'}
      </header>
      <div className="flex-1 overflow-y-auto p-2">
        <RoomGroup title="Unread" rooms={groups.unread} activeRoomId={activeRoomId} onClick={setActiveRoom} client={client} />
        <RoomGroup title="Direct messages" rooms={groups.dms} activeRoomId={activeRoomId} onClick={setActiveRoom} client={client} />
        <RoomGroup title="Rooms" rooms={groups.normal} activeRoomId={activeRoomId} onClick={setActiveRoom} client={client} />
      </div>
      <footer className="flex h-14 items-center gap-2 border-t border-[var(--color-divider)] bg-[var(--color-panel-2)] px-2">
        <div className="h-8 w-8 rounded-full bg-[var(--color-accent)]" aria-hidden />
        <div className="flex min-w-0 flex-col text-xs">
          <span className="truncate font-semibold text-white">
            {account?.userId ?? 'Not signed in'}
          </span>
          <span className="truncate text-neutral-400">
            {account?.syncState ?? 'idle'}
          </span>
        </div>
      </footer>
    </aside>
  );
}

function RoomGroup({
  title,
  rooms,
  activeRoomId,
  onClick,
  client,
}: {
  title: string;
  rooms: RoomSummary[];
  activeRoomId: string | null;
  onClick: (roomId: string) => void;
  client: import('matrix-js-sdk').MatrixClient | null;
}) {
  if (rooms.length === 0) return null;
  return (
    <div className="mt-2">
      <div className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">
        {title}
      </div>
      <ul className="space-y-0.5">
        {rooms.map((r) => (
          <li key={r.roomId}>
            <button
              type="button"
              onClick={() => onClick(r.roomId)}
              className={cn(
                'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition-colors',
                activeRoomId === r.roomId
                  ? 'bg-[var(--color-surface)] text-white'
                  : 'text-neutral-300 hover:bg-[var(--color-panel-2)] hover:text-white',
                (r.unread > 0 || r.highlights > 0) && activeRoomId !== r.roomId &&
                  'font-semibold text-white',
              )}
            >
              <RoomIcon room={r} client={client} />
              <span className="flex-1 truncate">{r.name}</span>
              {r.highlights > 0 ? (
                <span className="rounded bg-red-600 px-1.5 text-[10px] font-bold">
                  {r.highlights}
                </span>
              ) : r.unread > 0 ? (
                <span className="rounded bg-neutral-600 px-1.5 text-[10px]">{r.unread}</span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RoomIcon({ room, client }: { room: RoomSummary; client: import('matrix-js-sdk').MatrixClient | null }) {
  const avatar = client ? mxcToHttp(client, room.avatarMxc, 28, 28) : null;
  if (avatar) {
    // eslint-disable-next-line jsx-a11y/alt-text
    return <img src={avatar} className="h-5 w-5 rounded-full bg-neutral-700 object-cover" />;
  }
  const Icon = room.isDirect ? Volume2 : room.isEncrypted ? Lock : Hash;
  return <Icon className="h-4 w-4 text-neutral-500" />;
}
