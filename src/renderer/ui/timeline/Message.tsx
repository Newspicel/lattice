import { useEffect, useMemo, useState } from 'react';
import { CornerDownRight, Lock, SmilePlus, Reply, Pencil, Trash2, MessageSquare } from 'lucide-react';
import { useTimelineStore, type TimelineEntry } from '@/state/timeline';
import { sanitizeEventHtml, renderPlainBody } from '@/lib/markdown';
import { useAccountsStore } from '@/state/accounts';
import { useUiStore } from '@/state/ui';
import { accountManager } from '@/matrix/AccountManager';
import { AuthedImage, useAuthedMedia, useAuthedEncryptedMedia, type EncryptedFile } from '@/lib/mxc';
import { redactEvent, sendReaction, sendEdit } from '@/matrix/messageOps';
import { PollView, isPollStartType } from './Poll';
import { Button } from '@/ui/primitives/button';
import { InitialBadge } from '@/ui/primitives/InitialBadge';
import { Textarea } from '@/ui/primitives/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/primitives/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/ui/primitives/dropdown-menu';

interface MessageItemProps {
  entry: TimelineEntry;
  showHeader?: boolean;
}

export function MessageItem({ entry, showHeader }: MessageItemProps) {
  const activeAccountId = useAccountsStore((s) => s.activeAccountId);
  const activeRoomId = useAccountsStore((s) => s.activeRoomId);
  const client = activeAccountId ? accountManager.getClient(activeAccountId) : null;
  const setThreadRoot = useUiStore((s) => s.setThreadRoot);
  const setReplyTo = useUiStore((s) => s.setReplyTo);
  const quickReactions = useUiStore((s) => s.quickReactions);
  const openLightbox = useUiStore((s) => s.openLightbox);
  const openProfileCard = useUiStore((s) => s.openProfileCard);
  const [editing, setEditing] = useState(false);
  const [reactionMenuOpen, setReactionMenuOpen] = useState(false);
  const [toolbarPinned, setToolbarPinned] = useState(false);

  useEffect(() => {
    if (reactionMenuOpen) {
      setToolbarPinned(true);
      return;
    }
    const t = setTimeout(() => setToolbarPinned(false), 200);
    return () => clearTimeout(t);
  }, [reactionMenuOpen]);
  const [draft, setDraft] = useState(
    typeof (entry.content as { body?: string }).body === 'string'
      ? ((entry.content as { body?: string }).body ?? '')
      : '',
  );

  const isMine = client?.getUserId() === entry.sender;

  const content = entry.content as {
    msgtype?: string;
    body?: string;
    format?: string;
    formatted_body?: string;
    url?: string;
    file?: EncryptedFile;
    info?: { mimetype?: string };
  };

  const isPendingDecryption =
    entry.type === 'm.room.encrypted' && !entry.isDecryptionFailure && !entry.isRedacted;

  const renderedHtml = useMemo(() => {
    if (entry.isRedacted)
      return '<em style="color: var(--color-text-faint)">[redacted]</em>';
    if (entry.isDecryptionFailure)
      return '<em class="text-amber-400">[unable to decrypt]</em>';
    if (isPendingDecryption)
      return '<em style="color: var(--color-text-faint)">decrypting…</em>';

    if (content.format === 'org.matrix.custom.html' && content.formatted_body) {
      return sanitizeEventHtml(stripMxReply(content.formatted_body));
    }
    return renderPlainBody(stripPlainReplyFallback(content.body ?? ''));
  }, [entry.isRedacted, entry.isDecryptionFailure, isPendingDecryption, content.format, content.formatted_body, content.body]);

  const replyTarget = useTimelineStore((s) => {
    if (!entry.replyToId || !activeRoomId) return null;
    const list = s.byRoom[activeRoomId];
    return list?.find((e) => e.eventId === entry.replyToId) ?? null;
  });
  const replyPreview = useMemo(
    () => (entry.replyToId ? formatReplyPreview(replyTarget) : null),
    [entry.replyToId, replyTarget],
  );

  const hasMediaSource =
    typeof content.url === 'string' || typeof content.file?.url === 'string';
  const isImage =
    !entry.isRedacted &&
    !entry.isDecryptionFailure &&
    (content.msgtype === 'm.image' || entry.type === 'm.sticker') &&
    hasMediaSource;
  const isFile =
    !entry.isRedacted &&
    !entry.isDecryptionFailure &&
    content.msgtype === 'm.file' &&
    hasMediaSource;

  const senderMxcAvatar = useMemo(() => {
    if (entry.senderAvatarMxc) return entry.senderAvatarMxc;
    if (!client) return null;
    const room = activeRoomId ? client.getRoom(activeRoomId) : null;
    return room?.getMember(entry.sender)?.getMxcAvatarUrl() ?? null;
  }, [client, activeRoomId, entry.sender, entry.senderAvatarMxc]);

  function showProfileCardAt(ev: React.MouseEvent) {
    if (!activeAccountId) return;
    openProfileCard({
      accountId: activeAccountId,
      roomId: activeRoomId,
      userId: entry.sender,
      anchor: { x: ev.clientX + 12, y: ev.clientY - 40 },
    });
    ev.stopPropagation();
  }

  async function onReact(key: string) {
    if (!client || !activeRoomId) return;
    await sendReaction(client, activeRoomId, entry.eventId, key);
  }
  async function onRedact() {
    if (!client || !activeRoomId) return;
    if (!confirm('Delete this message?')) return;
    await redactEvent(client, activeRoomId, entry.eventId);
  }
  async function onSaveEdit() {
    if (!client || !activeRoomId) return;
    await sendEdit(client, activeRoomId, entry.eventId, draft);
    setEditing(false);
  }

  return (
    <div
      id={messageDomId(entry.eventId)}
      className={`group relative flex gap-3 ${showHeader ? '' : 'mt-0.5'} px-4 py-0.5 hover:bg-[var(--color-hover-overlay-subtle)]`}
    >
      <div className={`absolute right-4 top-0 z-10 -translate-y-1/2 items-center gap-px border border-[var(--color-divider)] bg-[var(--color-panel-2)] p-px ${toolbarPinned ? 'flex' : 'hidden group-hover:flex'}`}>
        <DropdownMenu open={reactionMenuOpen} onOpenChange={setReactionMenuOpen}>
          <Tooltip>
            <TooltipTrigger
              render={
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Add reaction"
                    />
                  }
                />
              }
            >
              <SmilePlus className="h-4 w-4" />
            </TooltipTrigger>
            <TooltipContent>Add reaction</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end" className="w-auto min-w-0">
            <div className="flex flex-nowrap items-center gap-1 p-1">
              {quickReactions.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => onReact(r)}
                  className="px-2 py-1 text-base transition-colors hover:bg-[var(--color-hover-overlay)]"
                >
                  {r}
                </button>
              ))}
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                const k = prompt('Emoji');
                if (k) void onReact(k);
              }}
            >
              <SmilePlus className="h-4 w-4" />
              Custom reaction…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => setReplyTo(entry.eventId)}
                aria-label="Reply"
              />
            }
          >
            <Reply className="h-4 w-4" />
          </TooltipTrigger>
          <TooltipContent>Reply</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => setThreadRoot(entry.eventId)}
                aria-label="Reply in thread"
              />
            }
          >
            <MessageSquare className="h-4 w-4" />
          </TooltipTrigger>
          <TooltipContent>Reply in thread</TooltipContent>
        </Tooltip>
        {isMine && !entry.isRedacted && (
          <>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => setEditing(true)}
                    aria-label="Edit"
                  />
                }
              >
                <Pencil className="h-4 w-4" />
              </TooltipTrigger>
              <TooltipContent>Edit</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={onRedact}
                    aria-label="Delete"
                    className="text-red-400 hover:text-red-300"
                  />
                }
              >
                <Trash2 className="h-4 w-4" />
              </TooltipTrigger>
              <TooltipContent>Delete</TooltipContent>
            </Tooltip>
          </>
        )}
      </div>
      <div className="w-10 flex-shrink-0">
        {showHeader ? (
          <button
            type="button"
            onClick={showProfileCardAt}
            className="block h-10 w-10 focus:outline-none focus:ring-1 focus:ring-[var(--color-text-strong)]"
            aria-label={`Profile — ${entry.senderDisplayName}`}
          >
            <AuthedImage
              client={client}
              mxc={senderMxcAvatar}
              width={40}
              height={40}
              className="h-10 w-10 bg-[var(--color-surface)] object-cover"
              fallback={
                <InitialBadge
                  text={entry.senderDisplayName}
                  className="h-10 w-10 text-base uppercase tracking-wide"
                />
              }
            />
          </button>
        ) : (
          <span className="invisible select-none font-mono text-[10px] leading-[1.375rem] text-[var(--color-text-faint)] tabular-nums group-hover:visible">
            {formatTime24(entry.ts)}
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        {showHeader && (
          <div className="flex items-baseline gap-2">
            <button
              type="button"
              onClick={showProfileCardAt}
              className="text-sm font-semibold text-[var(--color-text-strong)] hover:underline"
            >
              {entry.senderDisplayName}
            </button>
            <span className="font-mono text-[10px] text-[var(--color-text-faint)] tabular-nums">
              {formatTime24(entry.ts)}
            </span>
            {entry.isEncrypted && <Lock className="h-3 w-3 text-emerald-500" />}
          </div>
        )}
        {replyPreview && entry.replyToId && (
          <button
            type="button"
            onClick={() => jumpToMessage(entry.replyToId!)}
            className="mb-1 flex w-full items-center gap-1.5 text-left text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            title="Jump to message"
          >
            <CornerDownRight className="h-3 w-3 shrink-0" />
            <span className="shrink-0 font-semibold text-[var(--color-text-strong)]">
              {replyPreview.sender}
            </span>
            <span className="min-w-0 flex-1 truncate">{replyPreview.body}</span>
          </button>
        )}
        {isPollStartType(entry.type) && client && activeRoomId ? (
          <PollView
            client={client}
            roomId={activeRoomId}
            startEventId={entry.eventId}
            content={entry.content as Parameters<typeof PollView>[0]['content']}
          />
        ) : editing ? (
          <div className="flex flex-col gap-1">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={Math.min(8, Math.max(1, draft.split('\n').length))}
            />
            <div className="flex gap-2 text-xs">
              <Button size="xs" onClick={onSaveEdit}>
                Save
              </Button>
              <Button size="xs" variant="secondary" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : isImage && client ? (
          <button
            type="button"
            onClick={() =>
              openLightbox({
                mxc: content.file ? null : content.url,
                file: content.file ?? null,
                mimetype: content.info?.mimetype,
                alt: content.body ?? '',
              })
            }
            className="block cursor-zoom-in border border-[var(--color-divider)]"
            title="Click to expand"
          >
            <AuthedImage
              client={client}
              mxc={content.file ? null : content.url}
              file={content.file ?? null}
              mimetype={content.info?.mimetype}
              width={480}
              height={320}
              alt={content.body ?? ''}
              style={{ maxWidth: 480, maxHeight: 320 }}
              fallback={
                <span className="text-sm text-[var(--color-text-muted)]">
                  {content.body || 'image'}
                </span>
              }
            />
          </button>
        ) : isFile && client ? (
          <FileDownloadLink
            client={client}
            mxc={content.file ? null : (content.url ?? null)}
            file={content.file ?? null}
            mimetype={content.info?.mimetype}
            label={content.body ?? 'file'}
          />
        ) : (
          <div
            className="prose dark:prose-invert max-w-none text-sm leading-relaxed text-[var(--color-text)] [&_a]:text-[var(--color-text-strong)] [&_a]:underline [&_a]:underline-offset-2 [&_code]:bg-[var(--color-code-bg)] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em] [&_pre]:bg-[var(--color-code-bg)] [&_pre]:p-3 [&_pre]:font-mono [&_pre]:text-xs"
            dangerouslySetInnerHTML={{ __html: renderedHtml }}
          />
        )}
        {entry.editedFromId && (
          <span className="ml-1 text-[10px] text-[var(--color-text-faint)]" title="edited">
            (edited)
          </span>
        )}
        {Object.keys(entry.reactions).length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {Object.entries(entry.reactions).map(([key, info]) => (
              <span
                key={key}
                className={`flex items-center gap-1 border px-1.5 py-0.5 text-xs tabular-nums transition-colors ${
                  info.byMe
                    ? 'border-[var(--color-text-strong)] bg-[var(--color-surface)] text-[var(--color-text-strong)]'
                    : 'border-[var(--color-divider)] bg-[var(--color-panel-2)] text-[var(--color-text-muted)]'
                }`}
              >
                <span>{key}</span>
                <span className="font-mono text-[10px]">{info.count}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FileDownloadLink({
  client,
  mxc,
  file,
  mimetype,
  label,
}: {
  client: NonNullable<ReturnType<typeof accountManager.getClient>>;
  mxc: string | null;
  file: EncryptedFile | null;
  mimetype?: string;
  label: string;
}) {
  const plainUrl = useAuthedMedia(client, file ? null : mxc);
  const encUrl = useAuthedEncryptedMedia(client, file, mimetype);
  const url = file ? encUrl : plainUrl;
  if (!url) return <span className="text-[var(--color-text-muted)]">{label}</span>;
  return (
    <a href={url} download={label} target="_blank" rel="noopener" className="text-sky-400">
      {label}
    </a>
  );
}

function formatTime24(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function messageDomId(eventId: string): string {
  // Slashes / colons in matrix event IDs need encoding to be valid id characters.
  return `msg-${encodeURIComponent(eventId)}`;
}

export function jumpToMessage(eventId: string): void {
  const el = document.getElementById(messageDomId(eventId));
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.remove('message-flash');
  // Restart the animation by forcing a reflow before re-adding the class.
  void el.offsetWidth;
  el.classList.add('message-flash');
  window.setTimeout(() => el.classList.remove('message-flash'), 1700);
}

function stripMxReply(html: string): string {
  return html.replace(/<mx-reply>[\s\S]*?<\/mx-reply>/i, '');
}

function stripPlainReplyFallback(body: string): string {
  const lines = body.split('\n');
  let i = 0;
  while (i < lines.length && lines[i].startsWith('> ')) i++;
  while (i < lines.length && lines[i].trim() === '') i++;
  return lines.slice(i).join('\n');
}

function formatReplyPreview(target: TimelineEntry | null): { sender: string; body: string } {
  if (!target) return { sender: 'message', body: 'unavailable' };
  const c = target.content as { body?: string; msgtype?: string } | null;
  const cleaned = stripPlainReplyFallback((c?.body ?? '').trim());
  let body = cleaned.replace(/\n+/g, ' ').trim();
  if (!body) {
    if (c?.msgtype === 'm.image') body = '[image]';
    else if (c?.msgtype === 'm.file') body = '[file]';
    else if (target.isRedacted) body = '[redacted]';
    else body = '…';
  }
  if (body.length > 160) body = `${body.slice(0, 160)}…`;
  return { sender: target.senderDisplayName, body };
}
