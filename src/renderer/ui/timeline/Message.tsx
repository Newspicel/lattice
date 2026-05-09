import { useEffect, useMemo, useState } from 'react';
import {
  CornerDownRight,
  Lock,
  SmilePlus,
  Reply,
  Pencil,
  Trash2,
  MessageSquare,
  ShieldAlert,
  Download,
  File as FileIcon,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileText,
  FileVideo,
} from 'lucide-react';
import { useTimelineStore, type TimelineEntry } from '@/state/timeline';
import { sanitizeEventHtml, renderPlainBody } from '@/lib/markdown';
import { HtmlBody } from '@/lib/htmlToReact';
import { smoothScrollIntoCenter } from '@/lib/smoothScroll';
import { useAccountsStore } from '@/state/accounts';
import { useUiStore } from '@/state/ui';
import { accountManager } from '@/matrix/AccountManager';
import { AuthedImage, useAuthedMedia, useAuthedEncryptedMedia, type EncryptedFile } from '@/lib/mxc';
import { redactEvent, sendReaction, sendEdit } from '@/matrix/messageOps';
import { resolveCustomEmoji, useAvailableEmoticons } from '@/state/customEmojis';
import { EmoteImage } from './EmoteImage';
import { ReactionPill } from './ReactionPill';
import { EmojiPicker } from '@/ui/primitives/emoji-picker';
import { PollView, isPollStartType } from './Poll';
import { StickerMessage } from './StickerMessage';
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
  const availableEmoticons = useAvailableEmoticons(activeAccountId, activeRoomId);
  const openLightbox = useUiStore((s) => s.openLightbox);
  const openProfileCard = useUiStore((s) => s.openProfileCard);
  const [editing, setEditing] = useState(false);
  const [reactionMenuOpen, setReactionMenuOpen] = useState(false);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  // Pin the hover toolbar while a menu is open, and briefly after closing so
  // the toolbar doesn't flicker out from under the cursor.
  const menusOpen = reactionMenuOpen || emojiPickerOpen;
  const [coolingDown, setCoolingDown] = useState(false);
  const [prevMenusOpen, setPrevMenusOpen] = useState(menusOpen);
  if (prevMenusOpen !== menusOpen) {
    setPrevMenusOpen(menusOpen);
    if (prevMenusOpen && !menusOpen) setCoolingDown(true);
  }
  useEffect(() => {
    if (!coolingDown) return;
    const t = setTimeout(() => setCoolingDown(false), 200);
    return () => clearTimeout(t);
  }, [coolingDown]);
  const toolbarPinned = menusOpen || coolingDown;
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
    info?: { mimetype?: string; size?: number };
  };

  const isPendingDecryption =
    entry.type === 'm.room.encrypted' && !entry.isDecryptionFailure && !entry.isRedacted;

  const renderedHtml = useMemo(() => {
    if (entry.isRedacted)
      return '<em style="color: var(--color-text-faint)">[redacted]</em>';
    if (isPendingDecryption)
      return '<em style="color: var(--color-text-faint)">decrypting…</em>';

    if (content.format === 'org.matrix.custom.html' && content.formatted_body) {
      return sanitizeEventHtml(stripMxReply(content.formatted_body));
    }
    return renderPlainBody(stripPlainReplyFallback(content.body ?? ''));
  }, [entry.isRedacted, isPendingDecryption, content.format, content.formatted_body, content.body]);

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
  const isSticker =
    !entry.isRedacted &&
    !entry.isDecryptionFailure &&
    entry.type === 'm.sticker' &&
    hasMediaSource;
  const isImage =
    !entry.isRedacted &&
    !entry.isDecryptionFailure &&
    !isSticker &&
    content.msgtype === 'm.image' &&
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
    await sendEdit(client, activeRoomId, entry.eventId, draft, (code) =>
      resolveCustomEmoji(activeAccountId, activeRoomId, code),
    );
    setEditing(false);
  }

  return (
    <div
      id={messageDomId(entry.eventId)}
      className={`group relative ${showHeader ? '' : 'mt-0.5'} px-4 py-0.5 hover:bg-[var(--color-hover-overlay-subtle)]`}
    >
      {/* Toolbar lives outside the content-visibility'd inner wrapper —
          paint containment from `content-visibility: auto` would otherwise
          clip the toolbar's right edge against the row's bounds. */}
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
              {quickReactions.map((r, i) =>
                r.kind === 'unicode' ? (
                  <button
                    key={`u-${i}-${r.value}`}
                    type="button"
                    onClick={() => {
                      void onReact(r.value);
                      setReactionMenuOpen(false);
                    }}
                    className="px-2 py-1 text-base transition-colors hover:bg-[var(--color-hover-overlay)]"
                  >
                    {r.value}
                  </button>
                ) : (
                  <button
                    key={`c-${i}-${r.mxc}`}
                    type="button"
                    onClick={() => {
                      void onReact(r.mxc);
                      setReactionMenuOpen(false);
                    }}
                    className="flex h-7 w-7 items-center justify-center transition-colors hover:bg-[var(--color-hover-overlay)]"
                    title={`:${r.shortcode}:`}
                  >
                    <EmoteImage client={client} mxc={r.mxc} alt={`:${r.shortcode}:`} size={20} />
                  </button>
                ),
              )}
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                setReactionMenuOpen(false);
                // Defer to next tick so the dropdown finishes closing before
                // the popover lays itself out — otherwise the focus trap can
                // fight with the picker.
                requestAnimationFrame(() => setEmojiPickerOpen(true));
              }}
            >
              <SmilePlus className="h-4 w-4" />
              More emoji…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <EmojiPicker
          open={emojiPickerOpen}
          onOpenChange={setEmojiPickerOpen}
          side="bottom"
          align="end"
          customPacks={availableEmoticons}
          client={client}
          onSelect={(g) => {
            void onReact(g);
            setEmojiPickerOpen(false);
          }}
          onSelectCustom={(emoji) => {
            void onReact(emoji.mxc);
            setEmojiPickerOpen(false);
          }}
          trigger={
            <button
              type="button"
              aria-label="Pick reaction emoji"
              className="pointer-events-none absolute right-0 top-0 h-0 w-0 opacity-0"
            />
          }
        />
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
      <div className="timeline-row flex gap-3">
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
        ) : isSticker && client ? (
          <StickerMessage
            content={content as Parameters<typeof StickerMessage>[0]['content']}
            client={client}
            onClick={() =>
              openLightbox({
                mxc: content.file ? null : content.url,
                file: content.file ?? null,
                mimetype: content.info?.mimetype,
                alt: content.body ?? '',
              })
            }
          />
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
            size={content.info?.size}
            label={content.body ?? 'file'}
          />
        ) : entry.isDecryptionFailure ? (
          <DecryptionError />
        ) : (
          <div className="message-body prose dark:prose-invert max-w-none break-words text-sm leading-relaxed text-[var(--color-text)] [&_a]:text-[var(--color-text-strong)] [&_a]:underline [&_a]:underline-offset-2 [&_code]:bg-[var(--color-code-bg)] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em] [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:bg-[var(--color-code-bg)] [&_pre]:p-3 [&_pre]:font-mono [&_pre]:text-xs">
            <HtmlBody html={renderedHtml} client={client} />
          </div>
        )}
        {entry.editedFromId && (
          <span className="ml-1 text-[10px] text-[var(--color-text-faint)]" title="edited">
            (edited)
          </span>
        )}
        {Object.keys(entry.reactions).length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {Object.entries(entry.reactions).map(([key, info]) => (
              <ReactionPill
                key={key}
                client={client}
                reactionKey={key}
                count={info.count}
                byMe={info.byMe}
                resolveTooltip={(k) => {
                  if (!k.startsWith('mxc://')) return k;
                  const match = availableEmoticons.find((e) => e.mxc === k);
                  return match ? `:${match.shortcode}:` : 'custom';
                }}
                onClick={() => onReact(key)}
              />
            ))}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

function DecryptionError() {
  return (
    <div
      role="alert"
      className="inline-flex max-w-full items-start gap-2 border border-amber-600/40 bg-amber-950/25 px-2.5 py-1.5 text-xs"
    >
      <ShieldAlert className="mt-px h-3.5 w-3.5 shrink-0 text-amber-400" strokeWidth={2} />
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-amber-200">Unable to decrypt</div>
        <div className="text-amber-200/70">
          You may be missing the keys for this message. Verifying another session can recover them.
        </div>
      </div>
    </div>
  );
}

function FileDownloadLink({
  client,
  mxc,
  file,
  mimetype,
  size,
  label,
}: {
  client: NonNullable<ReturnType<typeof accountManager.getClient>>;
  mxc: string | null;
  file: EncryptedFile | null;
  mimetype?: string;
  size?: number;
  label: string;
}) {
  const plainUrl = useAuthedMedia(client, file ? null : mxc);
  const encUrl = useAuthedEncryptedMedia(client, file, mimetype);
  const url = file ? encUrl : plainUrl;

  const fileIcon = renderFileIcon(mimetype, label);
  const meta = formatFileMeta(size, mimetype, label);

  const cardClasses =
    'group/file inline-flex w-full max-w-md items-center gap-3 border border-[var(--color-divider)] bg-[var(--color-panel-2)] px-3 py-2.5 text-sm no-underline transition-colors';

  const inner = (
    <>
      <div className="flex h-10 w-10 shrink-0 items-center justify-center bg-[var(--color-surface)] text-[var(--color-text-muted)] transition-colors group-hover/file:text-[var(--color-text)]">
        {fileIcon}
      </div>
      <div className="min-w-0 flex-1">
        <div
          className="truncate font-medium text-[var(--color-text)]"
          title={label}
        >
          {label}
        </div>
        <div className="truncate font-mono text-[11px] tabular-nums text-[var(--color-text-faint)]">
          {meta}
        </div>
      </div>
      <Download
        className={`h-4 w-4 shrink-0 transition-opacity ${url ? 'text-[var(--color-text-muted)] opacity-0 group-hover/file:opacity-100' : 'animate-pulse text-[var(--color-text-faint)] opacity-100'}`}
        strokeWidth={1.75}
      />
    </>
  );

  if (!url) {
    return (
      <div
        className={`${cardClasses} cursor-progress`}
        aria-busy="true"
        aria-label={`Preparing ${label}`}
      >
        {inner}
      </div>
    );
  }

  return (
    <a
      href={url}
      download={label}
      target="_blank"
      rel="noopener"
      className={`${cardClasses} hover:bg-[var(--color-surface)]`}
    >
      {inner}
    </a>
  );
}

function renderFileIcon(mimetype: string | undefined, name: string) {
  const props = { className: 'h-5 w-5', strokeWidth: 1.75 } as const;
  const m = (mimetype ?? '').toLowerCase();
  if (m.startsWith('image/')) return <FileImage {...props} />;
  if (m.startsWith('video/')) return <FileVideo {...props} />;
  if (m.startsWith('audio/')) return <FileAudio {...props} />;
  if (m === 'application/pdf' || m.startsWith('text/')) return <FileText {...props} />;
  if (
    m === 'application/zip' ||
    m === 'application/x-zip-compressed' ||
    m === 'application/x-rar-compressed' ||
    m === 'application/x-7z-compressed' ||
    m === 'application/x-tar' ||
    m === 'application/gzip' ||
    m === 'application/x-bzip2'
  ) {
    return <FileArchive {...props} />;
  }
  if (
    m === 'application/json' ||
    m === 'application/xml' ||
    m === 'application/javascript' ||
    m === 'application/typescript'
  ) {
    return <FileCode {...props} />;
  }
  const ext = extOf(name);
  if (['zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'bz2', 'xz'].includes(ext)) return <FileArchive {...props} />;
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'heic'].includes(ext)) return <FileImage {...props} />;
  if (['mp4', 'mov', 'mkv', 'webm', 'avi'].includes(ext)) return <FileVideo {...props} />;
  if (['mp3', 'wav', 'flac', 'ogg', 'm4a', 'opus'].includes(ext)) return <FileAudio {...props} />;
  if (['pdf', 'txt', 'md', 'rtf'].includes(ext)) return <FileText {...props} />;
  if (
    ['js', 'ts', 'tsx', 'jsx', 'json', 'xml', 'yaml', 'yml', 'py', 'rb', 'go', 'rs', 'c', 'cpp', 'h', 'java', 'sh'].includes(ext)
  ) {
    return <FileCode {...props} />;
  }
  return <FileIcon {...props} />;
}

function formatFileMeta(size: number | undefined, mimetype: string | undefined, name: string): string {
  const parts: string[] = [];
  if (typeof size === 'number' && Number.isFinite(size)) parts.push(formatBytes(size));
  const tag = formatTypeTag(mimetype, name);
  if (tag) parts.push(tag);
  return parts.join(' · ') || 'file';
}

function formatTypeTag(mimetype: string | undefined, name: string): string {
  const ext = extOf(name);
  if (ext) return ext.toUpperCase();
  if (!mimetype) return '';
  const sub = mimetype.split('/')[1] ?? '';
  return sub.split(';')[0]?.toUpperCase() ?? '';
}

function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  if (i < 0 || i === name.length - 1) return '';
  return name.slice(i + 1).toLowerCase();
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatTime24(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function messageDomId(eventId: string): string {
  // Slashes / colons in matrix event IDs need encoding to be valid id characters.
  return `msg-${encodeURIComponent(eventId)}`;
}

function jumpToMessage(eventId: string): void {
  const el = document.getElementById(messageDomId(eventId));
  if (!el) return;
  const container = el.closest<HTMLElement>('[data-timeline-scroll]');
  if (container) {
    smoothScrollIntoCenter(el, container, 380);
  } else {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  // Wait for the scroll to settle before flashing so the highlight aligns
  // visually with the moment the message comes to rest.
  window.setTimeout(() => {
    el.classList.remove('message-flash');
    void el.offsetWidth;
    el.classList.add('message-flash');
    window.setTimeout(() => el.classList.remove('message-flash'), 1700);
  }, 320);
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
