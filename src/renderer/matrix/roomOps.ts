import { EventType, Preset, Visibility, type MatrixClient } from 'matrix-js-sdk';

export interface CreateRoomInput {
  name: string;
  topic?: string;
  isPublic: boolean;
  encrypted: boolean;
  parentSpaceId?: string | null;
  invite?: string[];
  alias?: string;
}

export interface CreateSpaceInput {
  name: string;
  topic?: string;
  isPublic: boolean;
  invite?: string[];
}

/**
 * Find an existing 1:1 DM with `userId`, or create a new one. Records the
 * room in `m.direct` so it appears under DMs on this account. The other
 * party will need to do the same on accept (handled in RequestBanner).
 */
export async function createOrOpenDirectMessage(
  client: MatrixClient,
  userId: string,
): Promise<string> {
  const trimmed = userId.trim();
  if (!isValidUserId(trimmed)) {
    throw new Error('Invalid Matrix user ID. Expected @user:server.tld.');
  }
  if (trimmed === client.getUserId()) {
    throw new Error('You can’t start a DM with yourself.');
  }

  const existing = findExistingDm(client, trimmed);
  if (existing) return existing;

  const result = await client.createRoom({
    preset: Preset.TrustedPrivateChat,
    visibility: Visibility.Private,
    is_direct: true,
    invite: [trimmed],
    initial_state: [encryptionStateEvent()],
  });

  await addRoomToDirect(client, trimmed, result.room_id);
  return result.room_id;
}

export async function createGroupRoom(
  client: MatrixClient,
  input: CreateRoomInput,
): Promise<string> {
  const initialState: Array<{ type: string; state_key?: string; content: object }> = [];
  if (input.encrypted) initialState.push(encryptionStateEvent());
  if (input.parentSpaceId) {
    initialState.push({
      type: 'm.space.parent',
      state_key: input.parentSpaceId,
      content: { canonical: true, via: [extractServerName(client.getUserId())] },
    });
  }

  const result = await client.createRoom({
    name: input.name,
    topic: input.topic || undefined,
    visibility: input.isPublic ? Visibility.Public : Visibility.Private,
    preset: input.isPublic ? Preset.PublicChat : Preset.PrivateChat,
    invite: input.invite ?? [],
    room_alias_name: input.alias?.trim() || undefined,
    initial_state: initialState,
  });

  if (input.parentSpaceId) {
    await addRoomToSpace(client, input.parentSpaceId, result.room_id);
  }
  return result.room_id;
}

export async function createSpace(
  client: MatrixClient,
  input: CreateSpaceInput,
): Promise<string> {
  const result = await client.createRoom({
    name: input.name,
    topic: input.topic || undefined,
    visibility: input.isPublic ? Visibility.Public : Visibility.Private,
    preset: input.isPublic ? Preset.PublicChat : Preset.PrivateChat,
    invite: input.invite ?? [],
    creation_content: { type: 'm.space' },
    // Spaces in Element/Synapse default to invite-rules; explicitly mark the
    // power levels so child-add isn't gated above the creator's default 100.
    power_level_content_override: {
      events_default: 100,
    },
  });
  return result.room_id;
}

/**
 * Add a room to a space by sending an `m.space.child` state event in the
 * space. The `via` list tells future joiners which servers to try when
 * peeking the child.
 */
export async function addRoomToSpace(
  client: MatrixClient,
  spaceId: string,
  childRoomId: string,
): Promise<void> {
  const via = extractServerName(client.getUserId());
  await client.sendStateEvent(
    spaceId,
    EventType.SpaceChild,
    { via: [via] },
    childRoomId,
  );
}

export async function removeRoomFromSpace(
  client: MatrixClient,
  spaceId: string,
  childRoomId: string,
): Promise<void> {
  // Tombstone the child by writing an empty content. Same shape `{}` as
  // SpaceChildEventContent with all optional fields cleared.
  await client.sendStateEvent(
    spaceId,
    EventType.SpaceChild,
    {},
    childRoomId,
  );
}

export async function setRoomName(
  client: MatrixClient,
  roomId: string,
  name: string,
): Promise<void> {
  await client.sendStateEvent(
    roomId,
    EventType.RoomName,
    { name: name.trim() },
    '',
  );
}

export async function setRoomTopic(
  client: MatrixClient,
  roomId: string,
  topic: string,
): Promise<void> {
  await client.sendStateEvent(
    roomId,
    EventType.RoomTopic,
    { topic },
    '',
  );
}

export async function setRoomAvatar(
  client: MatrixClient,
  roomId: string,
  mxc: string | null,
): Promise<void> {
  await client.sendStateEvent(
    roomId,
    EventType.RoomAvatar,
    mxc ? { url: mxc } : {},
    '',
  );
}

export async function enableRoomEncryption(
  client: MatrixClient,
  roomId: string,
): Promise<void> {
  await client.sendStateEvent(
    roomId,
    EventType.RoomEncryption,
    { algorithm: 'm.megolm.v1.aes-sha2' },
    '',
  );
}

export async function inviteToRoom(
  client: MatrixClient,
  roomId: string,
  userIds: string[],
): Promise<void> {
  for (const id of userIds) {
    const trimmed = id.trim();
    if (!isValidUserId(trimmed)) continue;
    await client.invite(roomId, trimmed);
  }
}

export async function leaveRoom(
  client: MatrixClient,
  roomId: string,
): Promise<void> {
  await client.leave(roomId);
}

export function isValidUserId(value: string): boolean {
  return /^@[^:\s]+:[^:\s]+$/.test(value);
}

function encryptionStateEvent() {
  return {
    type: 'm.room.encryption',
    state_key: '',
    content: { algorithm: 'm.megolm.v1.aes-sha2' },
  };
}

function extractServerName(userId: string | null): string {
  if (!userId) return '';
  const idx = userId.indexOf(':');
  return idx >= 0 ? userId.slice(idx + 1) : '';
}

function findExistingDm(client: MatrixClient, otherUserId: string): string | null {
  const direct = client
    .getAccountData(EventType.Direct)
    ?.getContent<Record<string, string[]>>();
  const candidates = direct?.[otherUserId] ?? [];
  for (const roomId of candidates) {
    const room = client.getRoom(roomId);
    if (!room) continue;
    if (room.getMyMembership() === 'leave') continue;
    return roomId;
  }
  return null;
}

async function addRoomToDirect(
  client: MatrixClient,
  otherUserId: string,
  roomId: string,
): Promise<void> {
  const existing = client
    .getAccountData(EventType.Direct)
    ?.getContent<Record<string, string[]>>();
  const next: Record<string, string[]> = existing ? { ...existing } : {};
  const list = new Set(next[otherUserId] ?? []);
  list.add(roomId);
  next[otherUserId] = Array.from(list);
  await client.setAccountData(EventType.Direct, next);
}
