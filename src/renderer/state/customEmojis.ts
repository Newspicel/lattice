import { useMemo } from 'react';
import { create } from 'zustand';
import type { MatrixClient } from 'matrix-js-sdk';
import {
  type CustomEmoji,
  type CustomEmojiPack,
  type MSC2545EmoteRoomsContent,
  getEmoteRooms,
  getRoomEmotePacks,
  getUserEmotePack,
  normaliseRoomPack,
  normaliseUserPack,
} from '@/matrix/customEmojis';

interface CustomEmojiState {
  userPacks: Record<string, CustomEmojiPack>;
  roomPacks: Record<string, Record<string, CustomEmojiPack[]>>;
  emoteRooms: Record<string, MSC2545EmoteRoomsContent>;

  refreshUserPack: (accountId: string, client: MatrixClient) => void;
  refreshRoomPacks: (accountId: string, roomId: string, client: MatrixClient) => void;
  refreshEmoteRooms: (accountId: string, client: MatrixClient) => void;
  refreshAllRoomsForAccount: (accountId: string, client: MatrixClient) => void;
  clearAccount: (accountId: string) => void;
}

export const useCustomEmojiStore = create<CustomEmojiState>((set, get) => ({
  userPacks: {},
  roomPacks: {},
  emoteRooms: {},

  refreshUserPack: (accountId, client) => {
    const pack = normaliseUserPack(getUserEmotePack(client));
    set((s) => ({ userPacks: { ...s.userPacks, [accountId]: pack } }));
  },

  refreshRoomPacks: (accountId, roomId, client) => {
    const room = client.getRoom(roomId);
    const fallback = room?.name?.trim() || roomId;
    const wire = getRoomEmotePacks(client, roomId);
    const packs: CustomEmojiPack[] = [];
    for (const [stateKey, content] of wire) {
      const labelBase = stateKey ? `${fallback} · ${stateKey}` : fallback;
      const pack = normaliseRoomPack(roomId, stateKey, content, labelBase);
      // Tombstoned packs (state key with empty images) shouldn't show up.
      if (pack.emoticons.length === 0 && pack.stickers.length === 0) continue;
      packs.push(pack);
    }
    set((s) => {
      const accountMap = { ...(s.roomPacks[accountId] ?? {}) };
      if (packs.length === 0) delete accountMap[roomId];
      else accountMap[roomId] = packs;
      return { roomPacks: { ...s.roomPacks, [accountId]: accountMap } };
    });
  },

  refreshEmoteRooms: (accountId, client) => {
    const content = getEmoteRooms(client);
    set((s) => ({ emoteRooms: { ...s.emoteRooms, [accountId]: content } }));
  },

  refreshAllRoomsForAccount: (accountId, client) => {
    for (const room of client.getRooms()) {
      get().refreshRoomPacks(accountId, room.roomId, client);
    }
  },

  clearAccount: (accountId) => {
    set((s) => {
      const { [accountId]: _u, ...userPacks } = s.userPacks;
      const { [accountId]: _r, ...roomPacks } = s.roomPacks;
      const { [accountId]: _e, ...emoteRooms } = s.emoteRooms;
      return { userPacks, roomPacks, emoteRooms };
    });
  },
}));

const EMPTY_PACK_ARRAY: CustomEmojiPack[] = [];
const EMPTY_EMOJI_ARRAY: CustomEmoji[] = [];
const EMPTY_DISCOVERABLE: DiscoverableRoomPack[] = [];

/** The user's personal pack for `accountId`, or null if not synced yet. */
export function useUserEmojiPack(accountId: string | null): CustomEmojiPack | null {
  return useCustomEmojiStore((s) => (accountId ? (s.userPacks[accountId] ?? null) : null));
}

/**
 * Packs published by `roomId`. The selector returns the underlying store
 * reference (which is rebuilt on refresh) so the result is stable between
 * unrelated store changes.
 */
export function useRoomEmojiPacks(
  accountId: string | null,
  roomId: string | null,
): CustomEmojiPack[] {
  return useCustomEmojiStore((s) => {
    if (!accountId || !roomId) return EMPTY_PACK_ARRAY;
    return s.roomPacks[accountId]?.[roomId] ?? EMPTY_PACK_ARRAY;
  });
}

/**
 * Packs the user has globally enabled via `im.ponies.emote_rooms`. Skips
 * entries that point to rooms the user has left or that are missing.
 */
export function useGloballyEnabledRoomPacks(
  accountId: string | null,
): CustomEmojiPack[] {
  // Read primitive store fragments via two stable selectors, then derive the
  // array once via useMemo. Building it inside a selector returns a fresh
  // reference per render and triggers infinite re-renders.
  const enabled = useCustomEmojiStore((s) =>
    accountId ? s.emoteRooms[accountId] : undefined,
  );
  const roomMap = useCustomEmojiStore((s) =>
    accountId ? s.roomPacks[accountId] : undefined,
  );
  return useMemo(() => buildEnabledPacks(enabled, roomMap), [enabled, roomMap]);
}

/**
 * Flat list of emoticons available when composing in `roomId`:
 *  current room → globally-enabled room packs → user pack.
 * Higher precedence wins on shortcode collision.
 */
export function useAvailableEmoticons(
  accountId: string | null,
  roomId: string | null,
): CustomEmoji[] {
  const userPack = useUserEmojiPack(accountId);
  const enabled = useCustomEmojiStore((s) =>
    accountId ? s.emoteRooms[accountId] : undefined,
  );
  const roomMap = useCustomEmojiStore((s) =>
    accountId ? s.roomPacks[accountId] : undefined,
  );
  return useMemo(
    () => flattenEmojis(userPack, roomMap, enabled, roomId, 'emoticons'),
    [userPack, roomMap, enabled, roomId],
  );
}

export function useAvailableStickers(
  accountId: string | null,
  roomId: string | null,
): CustomEmoji[] {
  const userPack = useUserEmojiPack(accountId);
  const enabled = useCustomEmojiStore((s) =>
    accountId ? s.emoteRooms[accountId] : undefined,
  );
  const roomMap = useCustomEmojiStore((s) =>
    accountId ? s.roomPacks[accountId] : undefined,
  );
  return useMemo(
    () => flattenEmojis(userPack, roomMap, enabled, roomId, 'stickers'),
    [userPack, roomMap, enabled, roomId],
  );
}

function buildEnabledPacks(
  enabled: MSC2545EmoteRoomsContent | undefined,
  roomMap: Record<string, CustomEmojiPack[]> | undefined,
): CustomEmojiPack[] {
  if (!enabled?.rooms || !roomMap) return EMPTY_PACK_ARRAY;
  const out: CustomEmojiPack[] = [];
  for (const [roomId, byKey] of Object.entries(enabled.rooms)) {
    const packs = roomMap[roomId];
    if (!packs) continue;
    for (const stateKey of Object.keys(byKey)) {
      const pack = packs.find(
        (p) => p.source.kind === 'room' && p.source.stateKey === stateKey,
      );
      if (pack) out.push(pack);
    }
  }
  return out.length > 0 ? out : EMPTY_PACK_ARRAY;
}

function flattenEmojis(
  userPack: CustomEmojiPack | null,
  roomMap: Record<string, CustomEmojiPack[]> | undefined,
  enabled: MSC2545EmoteRoomsContent | undefined,
  roomId: string | null,
  kind: 'emoticons' | 'stickers',
): CustomEmoji[] {
  const seen = new Set<string>();
  const out: CustomEmoji[] = [];
  const push = (list: CustomEmoji[]) => {
    for (const e of list) {
      if (seen.has(e.shortcode)) continue;
      seen.add(e.shortcode);
      out.push(e);
    }
  };

  // 1. Current room's packs.
  if (roomId && roomMap) {
    const here = roomMap[roomId];
    if (here) for (const p of here) push(p[kind]);
  }

  // 2. Globally-enabled packs from other rooms.
  if (enabled?.rooms && roomMap) {
    for (const [otherRoomId, byKey] of Object.entries(enabled.rooms)) {
      if (otherRoomId === roomId) continue;
      const packs = roomMap[otherRoomId];
      if (!packs) continue;
      for (const stateKey of Object.keys(byKey)) {
        const pack = packs.find(
          (p) => p.source.kind === 'room' && p.source.stateKey === stateKey,
        );
        if (pack) push(pack[kind]);
      }
    }
  }

  // 3. User pack.
  if (userPack) push(userPack[kind]);

  return out.length > 0 ? out : EMPTY_EMOJI_ARRAY;
}

export interface DiscoverableRoomPack {
  pack: CustomEmojiPack;
  enabled: boolean;
  roomName: string;
}

/**
 * Every room pack the user could globally enable: every (room, stateKey) pack
 * across rooms they're joined to. The Sources settings panel reads this.
 */
export function useDiscoverableRoomPacks(
  accountId: string | null,
  client: MatrixClient | null,
): DiscoverableRoomPack[] {
  const roomMap = useCustomEmojiStore((s) =>
    accountId ? s.roomPacks[accountId] : undefined,
  );
  const enabled = useCustomEmojiStore((s) =>
    accountId ? s.emoteRooms[accountId] : undefined,
  );
  return useMemo(() => {
    if (!client || !roomMap) return EMPTY_DISCOVERABLE;
    const out: DiscoverableRoomPack[] = [];
    for (const [roomId, packs] of Object.entries(roomMap)) {
      const room = client.getRoom(roomId);
      const roomName = room?.name?.trim() || roomId;
      for (const pack of packs) {
        if (pack.source.kind !== 'room') continue;
        const isEnabled = Boolean(
          enabled?.rooms?.[roomId]?.[pack.source.stateKey],
        );
        out.push({ pack, enabled: isEnabled, roomName });
      }
    }
    out.sort((a, b) => a.roomName.localeCompare(b.roomName));
    return out.length > 0 ? out : EMPTY_DISCOVERABLE;
  }, [client, roomMap, enabled]);
}

/**
 * Synchronous shortcode lookup for the send path. Same precedence as
 * `useAvailableEmoticons`, returning the first match.
 */
export function resolveCustomEmoji(
  accountId: string | null,
  roomId: string | null,
  shortcode: string,
): CustomEmoji | null {
  if (!accountId) return null;
  const code = shortcode.toLowerCase();
  const s = useCustomEmojiStore.getState();
  const list = flattenEmojis(
    s.userPacks[accountId] ?? null,
    s.roomPacks[accountId],
    s.emoteRooms[accountId],
    roomId,
    'emoticons',
  );
  for (const e of list) if (e.shortcode === code) return e;
  return null;
}
