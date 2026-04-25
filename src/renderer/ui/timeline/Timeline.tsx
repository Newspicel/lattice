import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Direction, type MatrixClient } from 'matrix-js-sdk';
import { useAccountsStore } from '@/state/accounts';
import { useRoomsStore } from '@/state/rooms';
import { useTimelineStore, type TimelineEntry } from '@/state/timeline';
import { accountManager } from '@/matrix/AccountManager';
import { AuthedImage } from '@/lib/mxc';
import { InitialBadge } from '@/ui/primitives/InitialBadge';
import { MessageItem } from './Message';

const EMPTY_ENTRIES: TimelineEntry[] = [];
const PAGINATE_TRIGGER_PX = 200;
const STICK_TO_BOTTOM_PX = 120;
const PAGE_SIZE = 50;

export function Timeline() {
  const activeAccountId = useAccountsStore((s) => s.activeAccountId);
  const activeRoomId = useAccountsStore((s) => s.activeRoomId);
  const entries = useTimelineStore((s) =>
    activeRoomId ? (s.byRoom[activeRoomId] ?? EMPTY_ENTRIES) : EMPTY_ENTRIES,
  );
  const roomSummary = useRoomsStore((s) => {
    if (!activeAccountId || !activeRoomId) return null;
    const rooms = s.byAccount[activeAccountId];
    return rooms?.find((r) => r.roomId === activeRoomId) ?? null;
  });
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const loadingOlderRef = useRef(false);
  const loadingScrollFloorRef = useRef<number | null>(null);
  const prevFirstIdRef = useRef<string | null>(null);
  const prevScrollHeightRef = useRef(0);

  // Hydrate timeline when room is selected.
  useEffect(() => {
    if (!activeAccountId || !activeRoomId) return;
    const client = accountManager.getClient(activeAccountId);
    if (!client) return;
    useTimelineStore.getState().onTimelineAppend(activeAccountId, activeRoomId, client);
  }, [activeAccountId, activeRoomId]);

  // Clear unread markers while the user is viewing this room. Runs on room
  // open and whenever a new event lands so subsequent messages don't re-mark
  // the room as unread while it's still on screen.
  useEffect(() => {
    if (!activeAccountId || !activeRoomId) return;
    const client = accountManager.getClient(activeAccountId);
    const room = client?.getRoom(activeRoomId);
    if (!client || !room) return;
    const events = room.getLiveTimeline().getEvents();
    const lastEvent = events[events.length - 1];
    if (!lastEvent) return;
    void client.sendReadReceipt(lastEvent);
  }, [activeAccountId, activeRoomId, entries]);

  // Reset scroll anchoring on room switch so the new room always lands at the
  // bottom on first render.
  useEffect(() => {
    stickToBottomRef.current = true;
    loadingOlderRef.current = false;
    loadingScrollFloorRef.current = null;
    prevFirstIdRef.current = null;
    prevScrollHeightRef.current = 0;
  }, [activeRoomId]);

  // Position the viewport after each render. Three cases:
  //   - first render in a room → scroll to bottom
  //   - older events prepended (first entry id changed) → preserve viewport
  //     position by shifting scrollTop by the scrollHeight delta
  //   - user is near the bottom → stick to bottom so new live events are visible
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const newHeight = el.scrollHeight;
    const prevHeight = prevScrollHeightRef.current;
    const firstId = entries[0]?.eventId ?? null;
    const prevFirst = prevFirstIdRef.current;

    if (prevFirst === null) {
      if (firstId !== null) el.scrollTop = newHeight;
    } else if (firstId !== prevFirst && !stickToBottomRef.current) {
      el.scrollTop = el.scrollTop + (newHeight - prevHeight);
    } else if (stickToBottomRef.current) {
      el.scrollTop = newHeight;
    }

    prevFirstIdRef.current = firstId;
    prevScrollHeightRef.current = newHeight;
  });

  async function loadOlder() {
    if (loadingOlderRef.current) return;
    if (!activeAccountId || !activeRoomId) return;
    const client = accountManager.getClient(activeAccountId);
    const room = client?.getRoom(activeRoomId);
    if (!client || !room) return;
    const timeline = room.getLiveTimeline();
    if (!timeline.getPaginationToken(Direction.Backward)) return;

    loadingOlderRef.current = true;
    // Pin a scroll floor at the position where pagination kicked off so the
    // user can't keep scrolling past the top while older events are loading.
    // The layout effect will lift this position once entries are prepended.
    loadingScrollFloorRef.current = scrollRef.current?.scrollTop ?? 0;
    try {
      await client.paginateEventTimeline(timeline, { backwards: true, limit: PAGE_SIZE });
    } catch (err) {
      console.warn('[timeline] paginate failed', err);
    } finally {
      loadingOlderRef.current = false;
      loadingScrollFloorRef.current = null;
    }
  }

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const floor = loadingScrollFloorRef.current;
    if (floor !== null && el.scrollTop < floor) {
      el.scrollTop = floor;
      return;
    }
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distanceFromBottom < STICK_TO_BOTTOM_PX;
    if (el.scrollTop < PAGINATE_TRIGGER_PX) {
      void loadOlder();
    }
  }

  const groups = useMemo(() => groupEntries(entries), [entries]);

  const beginningInfo = useMemo(() => {
    if (!activeAccountId || !activeRoomId) return null;
    const client = accountManager.getClient(activeAccountId);
    const room = client?.getRoom(activeRoomId);
    if (!client || !room) return null;
    const createEvent = room.currentState.getStateEvents('m.room.create', '');
    const creatorId = createEvent?.getSender() ?? null;
    const creatorName = creatorId ? (room.getMember(creatorId)?.name ?? null) : null;
    return {
      client,
      name: roomSummary?.name ?? room.name,
      avatarMxc: roomSummary?.dmAvatarMxc ?? roomSummary?.avatarMxc ?? room.getMxcAvatarUrl() ?? null,
      creatorName,
      createdAt: createEvent?.getTs() ?? null,
    };
  }, [activeAccountId, activeRoomId, roomSummary, entries]);

  if (!activeRoomId) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-[var(--color-text-faint)]">
        Select a room
      </div>
    );
  }

  let lastDateKey: string | null = null;

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className="flex-1 overflow-y-auto"
    >
      <div className="flex min-h-full flex-col py-3">
        <div className="mt-auto">
          {beginningInfo && <BeginningOfConversation info={beginningInfo} />}
          {groups.map((group, i) => {
            const dateKey = dayKey(group[0].ts);
            const showDateDivider = dateKey !== lastDateKey;
            lastDateKey = dateKey;
            return (
              <div key={`${group[0].eventId}-${i}`}>
                {showDateDivider && <DateDivider ts={group[0].ts} />}
                <div className="mt-4">
                  <MessageItem entry={group[0]} showHeader />
                  {group.slice(1).map((entry) => (
                    <MessageItem key={entry.eventId} entry={entry} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface BeginningInfo {
  client: MatrixClient;
  name: string;
  avatarMxc: string | null;
  creatorName: string | null;
  createdAt: number | null;
}

const BEGINNING_TS_FORMATTER = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function BeginningOfConversation({ info }: { info: BeginningInfo }) {
  return (
    <div className="px-4 pb-2 pt-16">
      <AuthedImage
        client={info.client}
        mxc={info.avatarMxc}
        width={80}
        height={80}
        className="h-20 w-20 rounded-2xl bg-[var(--color-surface)] object-cover"
        fallback={<InitialBadge text={info.name} className="h-20 w-20 rounded-2xl text-3xl" />}
      />
      <h2 className="mt-3 text-2xl font-bold text-[var(--color-text-strong)]">{info.name}</h2>
      <p className="mt-1 text-sm text-[var(--color-text)]">
        This is the beginning of conversation.
      </p>
      {info.creatorName && info.createdAt !== null && (
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">
          Created by{' '}
          <span className="font-medium text-[var(--color-text)]">@{info.creatorName}</span> on{' '}
          {BEGINNING_TS_FORMATTER.format(new Date(info.createdAt))}
        </p>
      )}
    </div>
  );
}

function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

function DateDivider({ ts }: { ts: number }) {
  return (
    <div className="mt-4 flex items-center gap-3 px-4">
      <div className="h-px flex-1 bg-[var(--color-divider)]" />
      <span className="text-[11px] font-medium text-[var(--color-text-faint)]">
        {DATE_FORMATTER.format(new Date(ts))}
      </span>
      <div className="h-px flex-1 bg-[var(--color-divider)]" />
    </div>
  );
}

function groupEntries(entries: TimelineEntry[]): TimelineEntry[][] {
  const groups: TimelineEntry[][] = [];
  let current: TimelineEntry[] = [];
  let lastSender: string | null = null;
  let lastTs = 0;

  for (const entry of entries) {
    const sameSender = entry.sender === lastSender;
    const sameMinute = entry.ts - lastTs < 5 * 60_000;
    if (current.length === 0 || !(sameSender && sameMinute)) {
      if (current.length) groups.push(current);
      current = [entry];
    } else {
      current.push(entry);
    }
    lastSender = entry.sender;
    lastTs = entry.ts;
  }
  if (current.length) groups.push(current);
  return groups;
}
