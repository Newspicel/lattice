import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Direction } from 'matrix-js-sdk';
import { useAccountsStore } from '@/state/accounts';
import { useTimelineStore, type TimelineEntry } from '@/state/timeline';
import { accountManager } from '@/matrix/AccountManager';
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const loadingOlderRef = useRef(false);
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
    try {
      await client.paginateEventTimeline(timeline, { backwards: true, limit: PAGE_SIZE });
    } catch (err) {
      console.warn('[timeline] paginate failed', err);
    } finally {
      loadingOlderRef.current = false;
    }
  }

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distanceFromBottom < STICK_TO_BOTTOM_PX;
    if (el.scrollTop < PAGINATE_TRIGGER_PX) {
      void loadOlder();
    }
  }

  const groups = useMemo(() => groupEntries(entries), [entries]);

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
      className="flex-1 overflow-y-auto py-3"
    >
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
