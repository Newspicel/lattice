import { useEffect, useMemo, useState } from 'react';
import type { MatrixClient } from 'matrix-js-sdk';
import type { IHierarchyRoom } from 'matrix-js-sdk/lib/@types/spaces';
import { Hash, Lock, Users, Volume2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAccountsStore } from '@/state/accounts';
import { useRoomsStore, type RoomSummary } from '@/state/rooms';
import { accountManager } from '@/matrix/AccountManager';
import { AuthedImage } from '@/lib/mxc';
import { Button } from '@/ui/primitives/button';

const VOICE_ROOM_TYPES = new Set([
  'm.call',
  'org.matrix.msc3417.call',
  'm.voice',
]);

export function SpaceLobby({ spaceId }: { spaceId: string }) {
  const activeAccountId = useAccountsStore((s) => s.activeAccountId);
  const setActiveRoom = useAccountsStore((s) => s.setActiveRoom);
  const allRooms = useRoomsStore((s) =>
    activeAccountId ? s.byAccount[activeAccountId] ?? [] : [],
  );
  const space = useMemo(
    () => allRooms.find((r) => r.roomId === spaceId && r.isSpace) ?? null,
    [allRooms, spaceId],
  );
  const client: MatrixClient | null =
    (activeAccountId ? accountManager.getClient(activeAccountId) : null) ?? null;

  if (!space || !client) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-[var(--color-text-muted)]">
        Space not available.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <LobbyHeader space={space} client={client} />
      <LobbyBody
        space={space}
        client={client}
        rooms={allRooms}
        onOpenRoom={setActiveRoom}
      />
    </div>
  );
}

function LobbyHeader({ space, client }: { space: RoomSummary; client: MatrixClient }) {
  const initial = (space.name.replace(/^[#@]/, '').charAt(0) || '?').toUpperCase();
  return (
    <header className="flex items-start gap-4 border-b border-[var(--color-divider)] bg-[var(--color-panel)] px-8 py-6">
      <div className="h-20 w-20 shrink-0 overflow-hidden bg-[var(--color-surface)]">
        <AuthedImage
          client={client}
          mxc={space.avatarMxc}
          width={80}
          height={80}
          className="h-full w-full object-cover"
          fallback={
            <span className="flex h-full w-full items-center justify-center text-2xl font-semibold uppercase text-[var(--color-text-strong)]">
              {initial}
            </span>
          }
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <h1 className="truncate text-xl font-semibold tracking-tight text-[var(--color-text-strong)]">
          {space.name}
        </h1>
        {space.topic && (
          <p className="text-sm leading-relaxed text-[var(--color-text-muted)]">
            {space.topic}
          </p>
        )}
        <div className="flex items-center gap-1.5 pt-0.5 text-xs text-[var(--color-text-muted)]">
          <Users className="h-3.5 w-3.5" strokeWidth={1.75} />
          <span>
            {space.memberCount} {space.memberCount === 1 ? 'member' : 'members'}
          </span>
        </div>
      </div>
    </header>
  );
}

function LobbyBody({
  space,
  client,
  rooms,
  onOpenRoom,
}: {
  space: RoomSummary;
  client: MatrixClient;
  rooms: RoomSummary[];
  onOpenRoom: (roomId: string) => void;
}) {
  const joinedChildren = useMemo(() => {
    const ids = new Set(space.spaceChildIds);
    return rooms.filter((r) => ids.has(r.roomId) && !r.isSpace);
  }, [rooms, space.spaceChildIds]);

  const { hierarchy, hierarchyLoading, hierarchyError } = useSpaceHierarchy(
    client,
    space.roomId,
  );

  const joinedIds = useMemo(
    () => new Set(rooms.map((r) => r.roomId)),
    [rooms],
  );
  // Hierarchy returns the queried space itself plus all descendants. Drop
  // anything we already see in our own room list (joined rooms and joined
  // subspaces) — those render in the dedicated joined section above.
  const discoverable = useMemo(() => {
    if (!hierarchy) return [];
    return hierarchy
      .filter((entry) => entry.room_id !== space.roomId)
      .filter((entry) => !joinedIds.has(entry.room_id));
  }, [hierarchy, joinedIds, space.roomId]);

  return (
    <div className="flex flex-1 flex-col gap-8 px-8 py-6">
      <Section title="Rooms in this space">
        {joinedChildren.length === 0 ? (
          <p className="text-sm italic text-[var(--color-text-faint)]">
            No rooms yet.
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            {joinedChildren.map((r) => (
              <JoinedRoomCard
                key={r.roomId}
                room={r}
                client={client}
                onOpen={() => onOpenRoom(r.roomId)}
              />
            ))}
          </ul>
        )}
      </Section>

      <Section title="Discover">
        {hierarchyLoading && (
          <p className="text-sm text-[var(--color-text-muted)]">Loading…</p>
        )}
        {hierarchyError && (
          <p className="text-sm text-[var(--color-text-muted)]">
            Couldn’t load discoverable rooms: {hierarchyError.message}
          </p>
        )}
        {!hierarchyLoading && !hierarchyError && discoverable.length === 0 && (
          <p className="text-sm italic text-[var(--color-text-faint)]">
            Nothing else to discover here.
          </p>
        )}
        {discoverable.length > 0 && (
          <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            {discoverable.map((entry) => (
              <DiscoverableRoomCard
                key={entry.room_id}
                entry={entry}
                client={client}
                onJoined={() => onOpenRoom(entry.room_id)}
                via={hierarchyVia(hierarchy, entry.room_id)}
              />
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
        {title}
      </h2>
      {children}
    </section>
  );
}

function JoinedRoomCard({
  room,
  client,
  onOpen,
}: {
  room: RoomSummary;
  client: MatrixClient;
  onOpen: () => void;
}) {
  const Icon = room.isVoice ? Volume2 : Hash;
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="group flex w-full items-start gap-3 border border-[var(--color-divider)] bg-[var(--color-panel-2)] p-3 text-left transition-colors hover:border-[var(--color-divider-strong)] hover:bg-[var(--color-hover-overlay-subtle)]"
      >
        <span className="relative flex h-8 w-8 shrink-0 items-center justify-center bg-[var(--color-surface)]">
          <AuthedImage
            client={client}
            mxc={room.avatarMxc}
            width={32}
            height={32}
            className="h-full w-full object-cover"
            fallback={
              <Icon className="h-4 w-4 text-[var(--color-text-faint)]" strokeWidth={1.75} />
            }
          />
          {room.isEncrypted && (
            <Lock
              aria-label="Encrypted"
              className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 text-emerald-500"
              strokeWidth={3}
            />
          )}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-sm font-medium text-[var(--color-text-strong)]">
            {room.name}
          </span>
          {room.topic && (
            <span className="line-clamp-2 text-xs text-[var(--color-text-muted)]">
              {room.topic}
            </span>
          )}
          <span className="pt-0.5 text-[11px] text-[var(--color-text-faint)]">
            {room.memberCount} {room.memberCount === 1 ? 'member' : 'members'}
          </span>
        </span>
      </button>
    </li>
  );
}

function DiscoverableRoomCard({
  entry,
  client,
  via,
  onJoined,
}: {
  entry: IHierarchyRoom;
  client: MatrixClient;
  via: string[];
  onJoined: () => void;
}) {
  const [joining, setJoining] = useState(false);
  const isSpace = entry.room_type === 'm.space';
  const isVoice = entry.room_type ? VOICE_ROOM_TYPES.has(entry.room_type) : false;
  const Icon = isVoice ? Volume2 : Hash;
  const name = entry.name || entry.canonical_alias || entry.room_id;
  const target = entry.canonical_alias ?? entry.room_id;

  async function onJoin() {
    setJoining(true);
    try {
      await client.joinRoom(target, { viaServers: via });
      toast.success(`Joined ${name}.`);
      // Don't auto-switch to subspaces — switching the active *room* into a
      // space id would put the user in a broken state. Joining alone is enough;
      // the new subspace will appear in the sidebar.
      if (!isSpace) onJoined();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setJoining(false);
    }
  }

  return (
    <li>
      <div className="flex items-start gap-3 border border-[var(--color-divider)] bg-[var(--color-panel-2)] p-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center bg-[var(--color-surface)]">
          <AuthedImage
            client={client}
            mxc={entry.avatar_url ?? null}
            width={32}
            height={32}
            className="h-full w-full object-cover"
            fallback={
              <Icon className="h-4 w-4 text-[var(--color-text-faint)]" strokeWidth={1.75} />
            }
          />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-medium text-[var(--color-text-strong)]">
              {name}
            </span>
            {isSpace && (
              <span className="shrink-0 border border-[var(--color-divider)] px-1 text-[9px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                Category
              </span>
            )}
          </div>
          {entry.topic && (
            <p className="line-clamp-2 text-xs text-[var(--color-text-muted)]">
              {entry.topic}
            </p>
          )}
          <span className="pt-0.5 text-[11px] text-[var(--color-text-faint)]">
            {entry.num_joined_members}{' '}
            {entry.num_joined_members === 1 ? 'member' : 'members'}
          </span>
        </div>
        <Button size="sm" onClick={onJoin} disabled={joining}>
          {joining ? 'Joining…' : 'Join'}
        </Button>
      </div>
    </li>
  );
}

interface HierarchyState {
  spaceId: string;
  rooms: IHierarchyRoom[] | null;
  error: Error | null;
}

function useSpaceHierarchy(client: MatrixClient, spaceId: string) {
  // Carry the spaceId we fetched for inside state. When the prop spaceId
  // changes, we render as "loading" until the next effect resolves with a
  // matching id — this lets the effect set state only inside callbacks
  // (avoiding the set-state-in-effect anti-pattern).
  const [state, setState] = useState<HierarchyState>({
    spaceId: '',
    rooms: null,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    client.getRoomHierarchy(spaceId, 50, 1).then(
      (res) => {
        if (cancelled) return;
        setState({ spaceId, rooms: res.rooms, error: null });
      },
      (err: unknown) => {
        if (cancelled) return;
        setState({
          spaceId,
          rooms: null,
          error: err instanceof Error ? err : new Error(String(err)),
        });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [client, spaceId]);

  const fresh = state.spaceId === spaceId;
  return {
    hierarchy: fresh ? state.rooms : null,
    hierarchyLoading: !fresh,
    hierarchyError: fresh ? state.error : null,
  };
}

// The via list for joining a child lives on the parent's children_state, not
// the child's own entry. Walk every parent in the response to find the entry
// pointing at this child and pull its via array.
function hierarchyVia(
  hierarchy: IHierarchyRoom[] | null,
  childRoomId: string,
): string[] {
  if (!hierarchy) return [];
  for (const parent of hierarchy) {
    for (const child of parent.children_state ?? []) {
      if (child.state_key === childRoomId) {
        return child.content?.via ?? [];
      }
    }
  }
  return [];
}
