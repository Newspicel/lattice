import { create } from 'zustand';
import type { MatrixClient, Room } from 'matrix-js-sdk';
import { EventType, NotificationCountType } from 'matrix-js-sdk';

export interface RoomSummary {
  roomId: string;
  name: string;
  avatarMxc: string | null;
  topic?: string;
  isDirect: boolean;
  isSpace: boolean;
  isEncrypted: boolean;
  memberCount: number;
  unread: number;
  highlights: number;
  lastActivity: number;
  parentSpaceIds: string[];
}

interface RoomsState {
  byAccount: Record<string, RoomSummary[]>;
  refreshRooms: (accountId: string, client: MatrixClient) => void;
  removeAccount: (accountId: string) => void;
}

function summarize(room: Room, client: MatrixClient): RoomSummary {
  const topicEvent = room.currentState.getStateEvents('m.room.topic', '');
  const topic = topicEvent?.getContent<{ topic?: string }>().topic;

  const memberEvent = room.getMember(client.getUserId() ?? '');
  const directContent = client
    .getAccountData(EventType.Direct)
    ?.getContent<Record<string, string[]>>();
  const directRoomIds = directContent ? Object.values(directContent).flat() : [];
  const isDirect = directRoomIds.includes(room.roomId);

  const parentSpaces = room.currentState
    .getStateEvents('m.space.parent')
    .map((e) => e.getStateKey())
    .filter((k): k is string => !!k);

  const timeline = room.getLiveTimeline().getEvents();
  const lastEvent = timeline[timeline.length - 1];

  return {
    roomId: room.roomId,
    name: room.name,
    avatarMxc: room.getMxcAvatarUrl(),
    topic,
    isDirect,
    isSpace: room.isSpaceRoom(),
    isEncrypted: room.hasEncryptionStateEvent(),
    memberCount: room.getJoinedMemberCount(),
    unread: room.getUnreadNotificationCount(),
    highlights: room.getUnreadNotificationCount(NotificationCountType.Highlight),
    lastActivity: lastEvent?.getTs() ?? memberEvent?.events.member?.getTs() ?? 0,
    parentSpaceIds: parentSpaces,
  };
}

export const useRoomsStore = create<RoomsState>((set) => ({
  byAccount: {},

  refreshRooms: (accountId, client) => {
    const rooms = client.getVisibleRooms().map((r) => summarize(r, client));
    rooms.sort((a, b) => b.lastActivity - a.lastActivity);
    set((state) => ({ byAccount: { ...state.byAccount, [accountId]: rooms } }));
  },

  removeAccount: (accountId) =>
    set((state) => {
      const { [accountId]: _removed, ...rest } = state.byAccount;
      return { byAccount: rest };
    }),
}));
