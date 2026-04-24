import type { MatrixClient, MatrixEvent, Room } from 'matrix-js-sdk';
import { PushProcessor } from 'matrix-js-sdk/lib/pushprocessor';
import type { NotificationPayload } from '@shared/types';

const TITLE_MAX = 64;
const BODY_MAX = 240;

/**
 * Run the push ruleset on an event and if it tweaks to "notify", pass a
 * payload to the main process to show a native OS notification.
 */
export function maybeNotify(
  accountId: string,
  client: MatrixClient,
  event: MatrixEvent,
  room: Room,
): void {
  if (document.hasFocus()) return;
  if (event.getSender() === client.getUserId()) return;
  if (event.isState()) return;
  const type = event.getType();
  if (type !== 'm.room.message' && type !== 'm.room.encrypted' && type !== 'm.sticker') return;

  const processor = new PushProcessor(client);
  const actions = processor.actionsForEvent(event);
  const shouldNotify = actions?.notify;
  if (!shouldNotify) return;

  const senderName = room.getMember(event.getSender() ?? '')?.name ?? event.getSender() ?? '';
  const bodyRaw = (event.getContent() as { body?: string }).body ?? '';
  const roomName = room.name ?? '';

  const payload: NotificationPayload = {
    accountId,
    roomId: room.roomId,
    eventId: event.getId() ?? '',
    title: truncate(`${senderName} · ${roomName}`, TITLE_MAX),
    body: truncate(bodyRaw, BODY_MAX),
  };
  void window.native.notifications.show(payload);
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}
