import { useEffect, useMemo, useState } from 'react';
import type { MatrixEvent, Room, RoomMember, RoomState } from 'matrix-js-sdk';
import { RoomStateEvent } from 'matrix-js-sdk';
import { useAccountsStore } from '@/state/accounts';
import { useUiStore } from '@/state/ui';
import { accountManager } from '@/matrix/AccountManager';
import { AuthedImage } from '@/lib/mxc';
import { InitialBadge } from '@/ui/primitives/InitialBadge';

// Cinny-originated convention for naming power-level bands, used by several
// clients for interop. If the room has no such state event, we render a flat
// list rather than inventing names.
const POWER_LEVEL_TAGS_EVENT = 'in.cinny.room.power_level_tags';

interface PowerLevelTag {
  name?: string;
}

type PowerLevelTags = Record<string, PowerLevelTag>;

interface MemberView {
  userId: string;
  name: string;
  avatarMxc: string | null;
  powerLevel: number;
}

interface MemberGroup {
  key: string;
  label: string | null;
  members: MemberView[];
}

export function MemberList() {
  const activeAccountId = useAccountsStore((s) => s.activeAccountId);
  const activeRoomId = useAccountsStore((s) => s.activeRoomId);
  const openProfileCard = useUiStore((s) => s.openProfileCard);
  const client = activeAccountId ? accountManager.getClient(activeAccountId) : null;

  const [members, setMembers] = useState<MemberView[]>([]);
  const [tags, setTags] = useState<PowerLevelTags | null>(null);

  useEffect(() => {
    setMembers([]);
    setTags(null);
    if (!client || !activeRoomId) return;
    const room = client.getRoom(activeRoomId);
    if (!room) return;

    let cancelled = false;

    const rebuildMembers = () => {
      if (cancelled) return;
      setMembers(toMemberViews(room.getJoinedMembers()));
    };
    const rebuildTags = () => {
      if (cancelled) return;
      setTags(readPowerLevelTags(room));
    };

    rebuildMembers();
    rebuildTags();
    room
      .loadMembersIfNeeded()
      .then(rebuildMembers)
      .catch(() => {});

    const onMembers = (_ev: MatrixEvent, state: RoomState) => {
      if (state.roomId !== room.roomId) return;
      rebuildMembers();
    };
    const onEvents = (event: MatrixEvent, state: RoomState) => {
      if (state.roomId !== room.roomId) return;
      if (event.getType() === POWER_LEVEL_TAGS_EVENT) rebuildTags();
      if (event.getType() === 'm.room.power_levels') rebuildMembers();
    };
    room.currentState.on(RoomStateEvent.Members, onMembers);
    room.currentState.on(RoomStateEvent.NewMember, onMembers);
    room.currentState.on(RoomStateEvent.Events, onEvents);

    return () => {
      cancelled = true;
      room.currentState.off(RoomStateEvent.Members, onMembers);
      room.currentState.off(RoomStateEvent.NewMember, onMembers);
      room.currentState.off(RoomStateEvent.Events, onEvents);
    };
  }, [client, activeRoomId]);

  const groups = useMemo(() => groupMembers(members, tags), [members, tags]);

  return (
    <aside
      className="hidden h-full w-60 shrink-0 flex-col bg-[var(--color-panel)] text-sm xl:flex"
      aria-label="Members"
    >
      <header className="flex h-12 shrink-0 items-center border-b border-[var(--color-divider)] px-4 font-semibold text-[var(--color-text-muted)] shadow-sm">
        Members{members.length > 0 ? ` — ${members.length}` : ''}
      </header>
      <div className="flex-1 overflow-y-auto p-2 text-[var(--color-text-muted)]">
        {!activeRoomId ? (
          <p className="px-2 pt-4 text-xs italic text-[var(--color-text-faint)]">
            Select a room to view members.
          </p>
        ) : members.length === 0 ? (
          <p className="px-2 pt-4 text-xs italic text-[var(--color-text-faint)]">
            Loading members…
          </p>
        ) : (
          groups.map((group) => (
            <div key={group.key} className="pb-2">
              {group.label && (
                <div className="px-2 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide">
                  {group.label} — {group.members.length}
                </div>
              )}
              <ul className="space-y-0.5">
                {group.members.map((m) => (
                  <li key={m.userId}>
                    <button
                      type="button"
                      onClick={(ev) => {
                        if (!activeAccountId) return;
                        openProfileCard({
                          accountId: activeAccountId,
                          roomId: activeRoomId,
                          userId: m.userId,
                          anchor: {
                            x: ev.currentTarget.getBoundingClientRect().left - 296,
                            y: ev.currentTarget.getBoundingClientRect().top - 20,
                          },
                        });
                      }}
                      className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[var(--color-text-muted)] hover:bg-[var(--color-panel-2)] hover:text-[var(--color-text-strong)]"
                      title={m.userId}
                    >
                      <AuthedImage
                        client={client}
                        mxc={m.avatarMxc}
                        width={32}
                        height={32}
                        className="h-6 w-6 rounded-full bg-[var(--color-surface)] object-cover"
                        fallback={
                          <InitialBadge text={m.name} className="h-6 w-6 rounded-full text-[11px]" />
                        }
                      />
                      <span className="flex-1 truncate">{m.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}

function toMemberViews(members: RoomMember[]): MemberView[] {
  return members
    .map((m) => ({
      userId: m.userId,
      name: m.name || m.userId,
      avatarMxc: m.getMxcAvatarUrl() ?? null,
      powerLevel: m.powerLevel,
    }))
    .sort((a, b) => {
      if (b.powerLevel !== a.powerLevel) return b.powerLevel - a.powerLevel;
      return a.name.localeCompare(b.name);
    });
}

function readPowerLevelTags(room: Room): PowerLevelTags | null {
  const event = room.currentState.getStateEvents(POWER_LEVEL_TAGS_EVENT, '');
  const content = event?.getContent<PowerLevelTags>();
  if (!content) return null;
  // Only keep entries that actually provide a name — an empty object wouldn't
  // give us anything to render and would just produce unlabeled buckets.
  const named: PowerLevelTags = {};
  for (const [k, v] of Object.entries(content)) {
    if (v && typeof v.name === 'string' && v.name.trim()) named[k] = v;
  }
  return Object.keys(named).length > 0 ? named : null;
}

function groupMembers(members: MemberView[], tags: PowerLevelTags | null): MemberGroup[] {
  if (!tags) {
    return members.length > 0
      ? [{ key: 'all', label: null, members }]
      : [];
  }

  const thresholds = Object.keys(tags)
    .map((k) => Number(k))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => b - a);

  const buckets = new Map<number, MemberView[]>(thresholds.map((t) => [t, []]));
  const uncategorized: MemberView[] = [];

  for (const m of members) {
    const threshold = thresholds.find((t) => m.powerLevel >= t);
    if (threshold === undefined) uncategorized.push(m);
    else buckets.get(threshold)!.push(m);
  }

  const groups: MemberGroup[] = [];
  for (const t of thresholds) {
    const bucket = buckets.get(t)!;
    if (bucket.length === 0) continue;
    groups.push({
      key: String(t),
      label: tags[String(t)]?.name ?? null,
      members: bucket,
    });
  }
  if (uncategorized.length > 0) {
    groups.push({ key: 'other', label: null, members: uncategorized });
  }
  return groups;
}
