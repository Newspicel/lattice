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
  target?: { sender: string; body: string; formattedBody?: string } | null,
): Promise<void> {
  const base = composeTextContent(body);
  const quote = target ? buildReplyQuote(roomId, replyToEventId, target) : null;
  const content = {
    ...base,
    body: quote ? `${quote.plain}${base.body}` : base.body,
    format: 'org.matrix.custom.html',
    formatted_body: quote
      ? `${quote.html}${base.formatted_body ?? escapeHtml(base.body).replace(/\n/g, '<br>')}`
      : (base.formatted_body ?? escapeHtml(base.body).replace(/\n/g, '<br>')),
    'm.relates_to': {
      'm.in_reply_to': { event_id: replyToEventId },
    },
  } as unknown as RoomMessageEventContent;
  await client.sendMessage(roomId, content);
}

function buildReplyQuote(
  roomId: string,
  eventId: string,
  target: { sender: string; body: string; formattedBody?: string },
): { plain: string; html: string } {
  const stripped = stripReplyFallback(target.body, target.formattedBody);
  const plainQuote = stripped.plain
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');
  const plain = `> <${target.sender}> ${plainQuote.slice(2)}\n\n`;
  const link = `https://matrix.to/#/${encodeURIComponent(roomId)}/${encodeURIComponent(eventId)}`;
  const userLink = `https://matrix.to/#/${encodeURIComponent(target.sender)}`;
  const html =
    `<mx-reply><blockquote>` +
    `<a href="${link}">In reply to</a> ` +
    `<a href="${userLink}">${escapeHtml(target.sender)}</a><br>` +
    `${stripped.html}` +
    `</blockquote></mx-reply>`;
  return { plain, html };
}

function stripReplyFallback(
  body: string,
  formattedBody?: string,
): { plain: string; html: string } {
  const plainLines = body.split('\n');
  let i = 0;
  while (i < plainLines.length && plainLines[i].startsWith('> ')) i++;
  while (i < plainLines.length && plainLines[i].trim() === '') i++;
  const plain = plainLines.slice(i).join('\n');
  let html = formattedBody ?? escapeHtml(plain).replace(/\n/g, '<br>');
  html = html.replace(/<mx-reply>[\s\S]*?<\/mx-reply>/i, '');
  return { plain, html };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
