/**
 * MSC2545 image-pack emojis and stickers.
 *
 * Three event types are involved:
 *   - `im.ponies.user_emotes`  — user account data; the user's personal pack
 *   - `im.ponies.room_emotes`  — room state event; pack(s) published by a room
 *   - `im.ponies.emote_rooms`  — user account data; which (room, stateKey)
 *                                 packs the user has globally enabled
 *
 * The wire shape is the same for user_emotes/room_emotes:
 *   {
 *     "images": { "<shortcode>": { url, body?, info?, usage? }, ... },
 *     "pack":   { display_name?, avatar_url?, attribution?, usage? }
 *   }
 */
import type { MatrixClient, Room } from 'matrix-js-sdk';

export const USER_EMOTES_TYPE = 'im.ponies.user_emotes';
export const ROOM_EMOTES_TYPE = 'im.ponies.room_emotes';
export const EMOTE_ROOMS_TYPE = 'im.ponies.emote_rooms';

export type EmoteUsage = 'emoticon' | 'sticker';

export interface MSC2545ImageInfo {
  w?: number;
  h?: number;
  mimetype?: string;
  size?: number;
}

export interface MSC2545Image {
  url: string;
  body?: string;
  info?: MSC2545ImageInfo;
  usage?: EmoteUsage[];
}

export interface MSC2545Pack {
  display_name?: string;
  avatar_url?: string;
  attribution?: string;
  usage?: EmoteUsage[];
}

export interface MSC2545EmotesContent {
  images: Record<string, MSC2545Image>;
  pack?: MSC2545Pack;
}

export interface MSC2545EmoteRoomsContent {
  rooms: Record<string, Record<string, Record<string, never>>>;
}

export type EmojiPackSource =
  | { kind: 'user' }
  | { kind: 'room'; roomId: string; stateKey: string };

export interface CustomEmoji {
  shortcode: string;
  mxc: string;
  body?: string;
  info?: MSC2545ImageInfo;
  usage: EmoteUsage[];
  source: EmojiPackSource;
}

export interface CustomEmojiPack {
  source: EmojiPackSource;
  displayName: string;
  avatarMxc?: string;
  attribution?: string;
  emoticons: CustomEmoji[];
  stickers: CustomEmoji[];
}

const SHORTCODE_RE = /^[a-z0-9_+-]{2,32}$/;

/** Normalise a shortcode candidate. Returns null if it can't be cleaned. */
export function canonicaliseShortcode(input: string): string | null {
  const cleaned = input.trim().toLowerCase().replace(/^:|:$/g, '');
  if (!SHORTCODE_RE.test(cleaned)) return null;
  return cleaned;
}

function emptyContent(): MSC2545EmotesContent {
  return { images: {}, pack: {} };
}

function emptyEmoteRooms(): MSC2545EmoteRoomsContent {
  return { rooms: {} };
}

/** Read the user's personal pack. Returns null if no event has been written yet. */
export function getUserEmotePack(client: MatrixClient): MSC2545EmotesContent | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const event = (client.getAccountData as any)(USER_EMOTES_TYPE);
  return (event?.getContent() as MSC2545EmotesContent | undefined) ?? null;
}

export async function setUserEmotePack(
  client: MatrixClient,
  content: MSC2545EmotesContent,
): Promise<void> {
  await setAccountDataUnsafe(client, USER_EMOTES_TYPE, content);
}

/**
 * Read every `im.ponies.room_emotes` state event in `roomId`. The map key is
 * the state key (the empty string for the default pack).
 */
export function getRoomEmotePacks(
  client: MatrixClient,
  roomId: string,
): Map<string, MSC2545EmotesContent> {
  const room = client.getRoom(roomId);
  const out = new Map<string, MSC2545EmotesContent>();
  if (!room) return out;
  const events = room.currentState.getStateEvents(ROOM_EMOTES_TYPE);
  for (const ev of events) {
    const stateKey = ev.getStateKey();
    if (stateKey == null) continue;
    const content = ev.getContent() as MSC2545EmotesContent | undefined;
    if (!content || typeof content !== 'object') continue;
    out.set(stateKey, content);
  }
  return out;
}

export async function setRoomEmotePack(
  client: MatrixClient,
  roomId: string,
  stateKey: string,
  content: MSC2545EmotesContent,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (client.sendStateEvent as any)(roomId, ROOM_EMOTES_TYPE, content, stateKey);
}

export async function deleteRoomEmotePack(
  client: MatrixClient,
  roomId: string,
  stateKey: string,
): Promise<void> {
  // Tombstone with empty content; matches how m.space.child is removed in roomOps.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (client.sendStateEvent as any)(roomId, ROOM_EMOTES_TYPE, {}, stateKey);
}

export function getEmoteRooms(client: MatrixClient): MSC2545EmoteRoomsContent {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const event = (client.getAccountData as any)(EMOTE_ROOMS_TYPE);
  const content = event?.getContent() as MSC2545EmoteRoomsContent | undefined;
  if (!content || typeof content !== 'object' || !content.rooms) {
    return emptyEmoteRooms();
  }
  return content;
}

export function isEmoteRoomEnabled(
  client: MatrixClient,
  roomId: string,
  stateKey: string,
): boolean {
  return Boolean(getEmoteRooms(client).rooms?.[roomId]?.[stateKey]);
}

export async function enableEmoteRoom(
  client: MatrixClient,
  roomId: string,
  stateKey: string,
): Promise<void> {
  const current = getEmoteRooms(client);
  const rooms = { ...current.rooms };
  const roomEntry = rooms[roomId] ? { ...rooms[roomId] } : {};
  if (roomEntry[stateKey]) return;
  roomEntry[stateKey] = {};
  rooms[roomId] = roomEntry;
  await setAccountDataUnsafe(client, EMOTE_ROOMS_TYPE, { rooms });
}

export async function disableEmoteRoom(
  client: MatrixClient,
  roomId: string,
  stateKey: string,
): Promise<void> {
  const current = getEmoteRooms(client);
  const rooms = { ...current.rooms };
  const roomEntry = rooms[roomId] ? { ...rooms[roomId] } : null;
  if (!roomEntry || !(stateKey in roomEntry)) return;
  delete roomEntry[stateKey];
  if (Object.keys(roomEntry).length === 0) delete rooms[roomId];
  else rooms[roomId] = roomEntry;
  await setAccountDataUnsafe(client, EMOTE_ROOMS_TYPE, { rooms });
}

export async function uploadEmojiImage(
  client: MatrixClient,
  file: File,
): Promise<{ mxc: string; info: MSC2545ImageInfo }> {
  const dims = await readImageDimensions(file);
  const upload = await client.uploadContent(file, {
    name: file.name,
    type: file.type,
  });
  const info: MSC2545ImageInfo = {
    mimetype: file.type || 'application/octet-stream',
    size: file.size,
  };
  if (dims) {
    info.w = dims.w;
    info.h = dims.h;
  }
  return { mxc: upload.content_uri, info };
}

/**
 * Add or overwrite an emoji in the user pack. Re-reads the existing event
 * inside the mutator so concurrent edits from another device aren't clobbered.
 */
export async function addUserEmoji(
  client: MatrixClient,
  shortcode: string,
  image: MSC2545Image,
): Promise<void> {
  const code = canonicaliseShortcode(shortcode);
  if (!code) throw new Error('Invalid shortcode');
  const current = getUserEmotePack(client) ?? emptyContent();
  const next: MSC2545EmotesContent = {
    ...current,
    images: { ...(current.images ?? {}), [code]: image },
  };
  await setUserEmotePack(client, next);
}

export async function removeUserEmoji(
  client: MatrixClient,
  shortcode: string,
): Promise<void> {
  const current = getUserEmotePack(client);
  if (!current?.images || !(shortcode in current.images)) return;
  const images = { ...current.images };
  delete images[shortcode];
  await setUserEmotePack(client, { ...current, images });
}

export async function renameUserEmoji(
  client: MatrixClient,
  oldShortcode: string,
  newShortcode: string,
): Promise<void> {
  const code = canonicaliseShortcode(newShortcode);
  if (!code) throw new Error('Invalid shortcode');
  const current = getUserEmotePack(client);
  if (!current?.images || !(oldShortcode in current.images)) return;
  if (code === oldShortcode) return;
  const image = current.images[oldShortcode];
  const images = { ...current.images };
  delete images[oldShortcode];
  images[code] = image;
  await setUserEmotePack(client, { ...current, images });
}

export async function setUserEmojiUsage(
  client: MatrixClient,
  shortcode: string,
  usage: EmoteUsage[],
): Promise<void> {
  const current = getUserEmotePack(client);
  if (!current?.images || !(shortcode in current.images)) return;
  const image = { ...current.images[shortcode], usage };
  await setUserEmotePack(client, {
    ...current,
    images: { ...current.images, [shortcode]: image },
  });
}

export async function setUserPackMeta(
  client: MatrixClient,
  meta: Partial<MSC2545Pack>,
): Promise<void> {
  const current = getUserEmotePack(client) ?? emptyContent();
  const pack: MSC2545Pack = { ...(current.pack ?? {}), ...meta };
  // Drop empty optional strings so we don't write `display_name: ''`.
  for (const key of Object.keys(pack) as (keyof MSC2545Pack)[]) {
    const v = pack[key];
    if (typeof v === 'string' && v.trim() === '') delete pack[key];
  }
  await setUserEmotePack(client, { ...current, pack });
}

export async function addRoomEmoji(
  client: MatrixClient,
  roomId: string,
  stateKey: string,
  shortcode: string,
  image: MSC2545Image,
): Promise<void> {
  const code = canonicaliseShortcode(shortcode);
  if (!code) throw new Error('Invalid shortcode');
  const packs = getRoomEmotePacks(client, roomId);
  const current = packs.get(stateKey) ?? emptyContent();
  const next: MSC2545EmotesContent = {
    ...current,
    images: { ...(current.images ?? {}), [code]: image },
  };
  await setRoomEmotePack(client, roomId, stateKey, next);
}

export async function removeRoomEmoji(
  client: MatrixClient,
  roomId: string,
  stateKey: string,
  shortcode: string,
): Promise<void> {
  const packs = getRoomEmotePacks(client, roomId);
  const current = packs.get(stateKey);
  if (!current?.images || !(shortcode in current.images)) return;
  const images = { ...current.images };
  delete images[shortcode];
  await setRoomEmotePack(client, roomId, stateKey, { ...current, images });
}

export async function renameRoomEmoji(
  client: MatrixClient,
  roomId: string,
  stateKey: string,
  oldShortcode: string,
  newShortcode: string,
): Promise<void> {
  const code = canonicaliseShortcode(newShortcode);
  if (!code) throw new Error('Invalid shortcode');
  const packs = getRoomEmotePacks(client, roomId);
  const current = packs.get(stateKey);
  if (!current?.images || !(oldShortcode in current.images)) return;
  if (code === oldShortcode) return;
  const image = current.images[oldShortcode];
  const images = { ...current.images };
  delete images[oldShortcode];
  images[code] = image;
  await setRoomEmotePack(client, roomId, stateKey, { ...current, images });
}

export async function setRoomEmojiUsage(
  client: MatrixClient,
  roomId: string,
  stateKey: string,
  shortcode: string,
  usage: EmoteUsage[],
): Promise<void> {
  const packs = getRoomEmotePacks(client, roomId);
  const current = packs.get(stateKey);
  if (!current?.images || !(shortcode in current.images)) return;
  const image = { ...current.images[shortcode], usage };
  await setRoomEmotePack(client, roomId, stateKey, {
    ...current,
    images: { ...current.images, [shortcode]: image },
  });
}

export async function setRoomPackMeta(
  client: MatrixClient,
  roomId: string,
  stateKey: string,
  meta: Partial<MSC2545Pack>,
): Promise<void> {
  const packs = getRoomEmotePacks(client, roomId);
  const current = packs.get(stateKey) ?? emptyContent();
  const pack: MSC2545Pack = { ...(current.pack ?? {}), ...meta };
  for (const key of Object.keys(pack) as (keyof MSC2545Pack)[]) {
    const v = pack[key];
    if (typeof v === 'string' && v.trim() === '') delete pack[key];
  }
  await setRoomEmotePack(client, roomId, stateKey, { ...current, pack });
}

/** Power-level check for editing a room's pack at any state key. */
export function maySendRoomEmotes(client: MatrixClient, room: Room): boolean {
  const userId = client.getUserId();
  if (!userId) return false;
  return room.currentState.maySendStateEvent(ROOM_EMOTES_TYPE, userId);
}

// Normalisation: wire content → flat CustomEmojiPack used by the rest of the app.

export function normaliseUserPack(raw: MSC2545EmotesContent | null): CustomEmojiPack {
  if (!raw) {
    return {
      source: { kind: 'user' },
      displayName: 'My emojis',
      emoticons: [],
      stickers: [],
    };
  }
  return normalisePack(raw, { kind: 'user' }, 'My emojis');
}

export function normaliseRoomPack(
  roomId: string,
  stateKey: string,
  raw: MSC2545EmotesContent,
  fallbackName: string,
): CustomEmojiPack {
  return normalisePack(raw, { kind: 'room', roomId, stateKey }, fallbackName);
}

function normalisePack(
  raw: MSC2545EmotesContent,
  source: EmojiPackSource,
  fallbackName: string,
): CustomEmojiPack {
  const packMeta: MSC2545Pack = raw.pack ?? {};
  const defaultUsage: EmoteUsage[] =
    Array.isArray(packMeta.usage) && packMeta.usage.length > 0
      ? packMeta.usage.filter(isUsage)
      : ['emoticon'];

  const emoticons: CustomEmoji[] = [];
  const stickers: CustomEmoji[] = [];

  for (const [shortcode, image] of Object.entries(raw.images ?? {})) {
    if (!image || typeof image.url !== 'string' || !image.url.startsWith('mxc://')) continue;
    const code = canonicaliseShortcode(shortcode);
    if (!code) continue;
    const usage = pickUsage(image.usage, defaultUsage);
    const entry: CustomEmoji = {
      shortcode: code,
      mxc: image.url,
      body: image.body,
      info: image.info,
      usage,
      source,
    };
    if (usage.includes('emoticon')) emoticons.push(entry);
    if (usage.includes('sticker')) stickers.push(entry);
  }

  emoticons.sort((a, b) => a.shortcode.localeCompare(b.shortcode));
  stickers.sort((a, b) => a.shortcode.localeCompare(b.shortcode));

  return {
    source,
    displayName: packMeta.display_name?.trim() || fallbackName,
    avatarMxc: packMeta.avatar_url || undefined,
    attribution: packMeta.attribution || undefined,
    emoticons,
    stickers,
  };
}

function isUsage(v: unknown): v is EmoteUsage {
  return v === 'emoticon' || v === 'sticker';
}

function pickUsage(
  imageUsage: EmoteUsage[] | undefined,
  packDefault: EmoteUsage[],
): EmoteUsage[] {
  if (Array.isArray(imageUsage) && imageUsage.length > 0) {
    const filtered = imageUsage.filter(isUsage);
    if (filtered.length > 0) return filtered;
  }
  return packDefault;
}

async function readImageDimensions(file: File): Promise<{ w: number; h: number } | null> {
  if (!file.type.startsWith('image/')) return null;
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ w: img.naturalWidth, h: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

/**
 * The matrix-js-sdk `setAccountData` parameter type is a discriminated union
 * over a closed set of well-known event types; `im.ponies.*` isn't part of it.
 * Cast through `unknown` here, in one place, so consumers can stay typed.
 */
async function setAccountDataUnsafe(
  client: MatrixClient,
  type: string,
  content: object,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (client.setAccountData as any)(type, content);
}
