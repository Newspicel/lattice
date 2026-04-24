import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import type { MatrixEvent } from 'matrix-js-sdk';
import { ThreadEvent } from 'matrix-js-sdk';
import { useUiStore } from '@/state/ui';
import { useAccountsStore } from '@/state/accounts';
import { accountManager } from '@/matrix/AccountManager';
import type { TimelineEntry } from '@/state/timeline';
import { MessageItem } from './Message';
import type { RoomMessageEventContent } from 'matrix-js-sdk/lib/@types/events';
import { composeTextContent } from '@/lib/markdown';

export function ThreadPane() {
  const threadRootId = useUiStore((s) => s.threadRootId);
  const close = useUiStore((s) => s.setThreadRoot);
  const activeAccountId = useAccountsStore((s) => s.activeAccountId);
  const activeRoomId = useAccountsStore((s) => s.activeRoomId);
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [draft, setDraft] = useState('');
  const client = activeAccountId ? (accountManager.getClient(activeAccountId) ?? null) : null;

  const room = useMemo(() => {
    if (!client || !activeRoomId) return null;
    return client.getRoom(activeRoomId);
  }, [client, activeRoomId]);

  useEffect(() => {
    if (!room || !threadRootId) return;
    const thread = room.getThread(threadRootId);
    if (!thread) return;
    const refresh = () => {
      const events = thread.timelineSet.getLiveTimeline().getEvents();
      setEntries(toTimelineEntries(events));
    };
    refresh();
    thread.on(ThreadEvent.Update, refresh);
    thread.on(ThreadEvent.NewReply, refresh);
    return () => {
      thread.off(ThreadEvent.Update, refresh);
      thread.off(ThreadEvent.NewReply, refresh);
    };
  }, [room, threadRootId]);

  async function send() {
    const body = draft.trim();
    if (!body || !client || !activeRoomId || !threadRootId) return;
    setDraft('');
    const base = composeTextContent(body);
    const content = {
      ...base,
      'm.relates_to': {
        rel_type: 'm.thread',
        event_id: threadRootId,
        is_falling_back: true,
        'm.in_reply_to': { event_id: threadRootId },
      },
    } as unknown as RoomMessageEventContent;
    try {
      await client.sendMessage(activeRoomId, content);
    } catch (err) {
      console.error(err);
      setDraft(body);
    }
  }

  if (!threadRootId) return null;
  return (
    <aside className="flex h-full w-96 shrink-0 flex-col border-l border-[var(--color-divider)] bg-[var(--color-panel)]">
      <header className="flex h-12 items-center justify-between border-b border-[var(--color-divider)] px-4 font-semibold">
        Thread
        <button
          type="button"
          onClick={() => close(null)}
          className="rounded p-1 hover:bg-white/10"
        >
          <X className="h-4 w-4" />
        </button>
      </header>
      <div className="flex-1 overflow-y-auto px-2 py-3">
        {entries.map((entry, i) => (
          <MessageItem
            key={entry.eventId}
            entry={entry}
            showHeader={i === 0 || entries[i - 1].sender !== entry.sender}
          />
        ))}
      </div>
      <div className="border-t border-[var(--color-divider)] p-3">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder="Reply in thread"
          rows={1}
          className="max-h-32 w-full resize-none rounded-md bg-[var(--color-surface)] px-3 py-2 text-sm outline-none"
        />
      </div>
    </aside>
  );
}

function toTimelineEntries(events: MatrixEvent[]): TimelineEntry[] {
  const out: TimelineEntry[] = [];
  for (const event of events) {
    const type = event.getType();
    if (type !== 'm.room.message' && type !== 'm.room.encrypted') continue;
    const eventId = event.getId();
    const sender = event.getSender();
    if (!eventId || !sender) continue;
    out.push({
      eventId,
      sender,
      senderDisplayName: sender,
      senderAvatarMxc: null,
      type,
      content: event.getContent(),
      ts: event.getTs(),
      isEncrypted: event.isEncrypted(),
      isDecryptionFailure: event.isDecryptionFailure(),
      isRedacted: event.isRedacted(),
      replyToId: undefined,
      threadRootId: event.threadRootId,
      editedFromId: undefined,
      reactions: {},
    });
  }
  return out;
}
