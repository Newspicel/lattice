import type { MatrixClient } from 'matrix-js-sdk';
import type { RoomMessageEventContent } from 'matrix-js-sdk/lib/@types/events';
import { composeTextContent } from '@/lib/markdown';

export async function sendReaction(
  client: MatrixClient,
  roomId: string,
  targetEventId: string,
  key: string,
): Promise<void> {
  const content = {
    'm.relates_to': {
      rel_type: 'm.annotation',
      event_id: targetEventId,
      key,
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (client.sendEvent as any)(roomId, 'm.reaction', content);
}

export async function redactEvent(
  client: MatrixClient,
  roomId: string,
  eventId: string,
  reason?: string,
): Promise<void> {
  await client.redactEvent(roomId, eventId, undefined, reason ? { reason } : undefined);
}

export async function sendEdit(
  client: MatrixClient,
  roomId: string,
  targetEventId: string,
  newBody: string,
): Promise<void> {
  const base = composeTextContent(newBody);
  const content = {
    ...base,
    body: `* ${base.body}`,
    'm.new_content': base,
    'm.relates_to': {
      rel_type: 'm.replace',
      event_id: targetEventId,
    },
  } as unknown as RoomMessageEventContent;
  await client.sendMessage(roomId, content);
}

export async function sendReply(
  client: MatrixClient,
  roomId: string,
  replyToEventId: string,
  body: string,
): Promise<void> {
  const base = composeTextContent(body);
  const content = {
    ...base,
    'm.relates_to': {
      'm.in_reply_to': { event_id: replyToEventId },
    },
  } as unknown as RoomMessageEventContent;
  await client.sendMessage(roomId, content);
}
