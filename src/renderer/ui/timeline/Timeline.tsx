import { useEffect, useMemo, useRef } from 'react';
import { useAccountsStore } from '@/state/accounts';
import { useTimelineStore, type TimelineEntry } from '@/state/timeline';
import { accountManager } from '@/matrix/AccountManager';
import { MessageItem } from './Message';

const EMPTY_ENTRIES: TimelineEntry[] = [];

export function Timeline() {
  const activeAccountId = useAccountsStore((s) => s.activeAccountId);
  const activeRoomId = useAccountsStore((s) => s.activeRoomId);
  const entries = useTimelineStore((s) =>
    activeRoomId ? (s.byRoom[activeRoomId] ?? EMPTY_ENTRIES) : EMPTY_ENTRIES,
  );
  const scrollRef = useRef<HTMLDivElement>(null);

  // Hydrate timeline when room is selected.
  useEffect(() => {
    if (!activeAccountId || !activeRoomId) return;
    const client = accountManager.getClient(activeAccountId);
    if (!client) return;
    useTimelineStore.getState().onTimelineAppend(activeAccountId, activeRoomId, client);
  }, [activeAccountId, activeRoomId]);

  // Auto-scroll to bottom when entries append.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [entries.length, activeRoomId]);

  const groups = useMemo(() => groupEntries(entries), [entries]);

  if (!activeRoomId) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-neutral-500">
        Select a room
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3">
      {groups.map((group, i) => (
        <div key={`${group[0].eventId}-${i}`} className="mb-4">
          <MessageItem entry={group[0]} showHeader />
          {group.slice(1).map((entry) => (
            <MessageItem key={entry.eventId} entry={entry} />
          ))}
        </div>
      ))}
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
