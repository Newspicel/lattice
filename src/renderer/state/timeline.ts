import { create } from 'zustand';
import type { MatrixClient, MatrixEvent } from 'matrix-js-sdk';

export interface TimelineEntry {
  eventId: string;
  sender: string;
  senderDisplayName: string;
  senderAvatarMxc: string | null;
  type: string;
  content: unknown;
  ts: number;
  isEncrypted: boolean;
  isDecryptionFailure: boolean;
  isRedacted: boolean;
  replyToId?: string;
  threadRootId?: string;
  editedFromId?: string;
  reactions: Record<string, { count: number; byMe: boolean }>;
}

interface TimelineState {
  byRoom: Record<string, TimelineEntry[]>;
  onTimelineAppend: (accountId: string, roomId: string, client: MatrixClient) => void;
  prune: (roomId: string) => void;
}

const RENDERED_TYPES = new Set([
  'm.room.message',
  'm.room.encrypted',
  'm.sticker',
  'org.matrix.msc3381.poll.start',
  'm.poll.start',
  'm.room.member', // for leave/join notices — optional
]);

function toEntry(event: MatrixEvent): TimelineEntry | null {
  const type = event.getType();
  if (!RENDERED_TYPES.has(type)) return null;
  // Skip state events here — members are rendered elsewhere.
  if (event.isState() && type !== 'm.room.member') return null;

  const eventId = event.getId();
  const sender = event.getSender();
  if (!eventId || !sender) return null;

  const relates = (event.getContent() as { 'm.relates_to'?: { rel_type?: string; event_id?: string } })[
    'm.relates_to'
  ];

  return {
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
    replyToId:
      relates?.rel_type === 'm.thread'
        ? relates.event_id
        : (event.getContent() as { 'm.relates_to'?: { 'm.in_reply_to'?: { event_id?: string } } })[
            'm.relates_to'
          ]?.['m.in_reply_to']?.event_id,
    threadRootId: event.threadRootId,
    editedFromId: relates?.rel_type === 'm.replace' ? relates.event_id : undefined,
    reactions: {},
  };
}

export const useTimelineStore = create<TimelineState>((set) => ({
  byRoom: {},

  onTimelineAppend: (_accountId, roomId, client) => {
    const room = client.getRoom(roomId);
    if (!room) return;
    const events = room.getLiveTimeline().getEvents();
    const entries: TimelineEntry[] = [];
    for (const ev of events) {
      const entry = toEntry(ev);
      if (entry) entries.push(entry);
    }

    // Collapse edits — keep only the latest edit's content but keep the original event id.
    const byOriginalId = new Map<string, TimelineEntry>();
    for (const entry of entries) {
      if (entry.editedFromId) {
        const root = byOriginalId.get(entry.editedFromId);
        if (root) {
          const newContent = (entry.content as { 'm.new_content'?: unknown })['m.new_content'];
          root.content = newContent ?? entry.content;
          root.editedFromId = entry.eventId; // marker that it was edited
        }
      } else {
        byOriginalId.set(entry.eventId, entry);
      }
    }

    // Aggregate reactions from non-rendered events too.
    for (const ev of events) {
      if (ev.getType() !== 'm.reaction') continue;
      const content = ev.getContent<{
        'm.relates_to'?: { rel_type?: string; event_id?: string; key?: string };
      }>();
      const rel = content['m.relates_to'];
      if (rel?.rel_type !== 'm.annotation' || !rel.event_id || !rel.key) continue;
      const target = byOriginalId.get(rel.event_id);
      if (!target) continue;
      const mine = ev.getSender() === client.getUserId();
      const slot = target.reactions[rel.key] ?? { count: 0, byMe: false };
      target.reactions[rel.key] = { count: slot.count + 1, byMe: slot.byMe || mine };
    }

    const final = Array.from(byOriginalId.values()).sort((a, b) => a.ts - b.ts);
    set((state) => ({ byRoom: { ...state.byRoom, [roomId]: final } }));
  },

  prune: (roomId) =>
    set((state) => {
      const { [roomId]: _removed, ...rest } = state.byRoom;
      return { byRoom: rest };
    }),
}));
