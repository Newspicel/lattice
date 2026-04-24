import { useMemo, useState } from 'react';
import { Lock, SmilePlus, Reply, Pencil, Trash2, MessageSquare } from 'lucide-react';
import type { TimelineEntry } from '@/state/timeline';
import { sanitizeEventHtml } from '@/lib/markdown';
import { useAccountsStore } from '@/state/accounts';
import { useUiStore } from '@/state/ui';
import { accountManager } from '@/matrix/AccountManager';
import { AuthedImage, useAuthedMedia } from '@/lib/mxc';
import { redactEvent, sendReaction, sendEdit } from '@/matrix/messageOps';
import { PollView, isPollStartType } from './Poll';

interface MessageItemProps {
  entry: TimelineEntry;
  showHeader?: boolean;
}

const QUICK_REACTIONS = ['👍', '❤️', '😂', '🎉', '🙏'];

export function MessageItem({ entry, showHeader }: MessageItemProps) {
  const activeAccountId = useAccountsStore((s) => s.activeAccountId);
  const activeRoomId = useAccountsStore((s) => s.activeRoomId);
  const client = activeAccountId ? accountManager.getClient(activeAccountId) : null;
  const setThreadRoot = useUiStore((s) => s.setThreadRoot);
  const [editing, setEditing] = useState(false);
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
  };

  const renderedHtml = useMemo(() => {
    if (entry.isRedacted)
      return '<em style="color: var(--color-text-faint)">[redacted]</em>';
    if (entry.isDecryptionFailure)
      return '<em class="text-amber-400">[unable to decrypt]</em>';

    if (content.format === 'org.matrix.custom.html' && content.formatted_body) {
      return sanitizeEventHtml(content.formatted_body);
    }
    return escapeHtml(content.body ?? '');
  }, [entry.isRedacted, entry.isDecryptionFailure, content.format, content.formatted_body, content.body]);

  const isImage =
    !entry.isRedacted &&
    !entry.isDecryptionFailure &&
    content.msgtype === 'm.image' &&
    typeof content.url === 'string';
  const isFile =
    !entry.isRedacted &&
    !entry.isDecryptionFailure &&
    content.msgtype === 'm.file' &&
    typeof content.url === 'string';

  const senderMxcAvatar = useMemo(() => {
    if (!client) return null;
    const room = activeRoomId ? client.getRoom(activeRoomId) : null;
    return room?.getMember(entry.sender)?.getMxcAvatarUrl() ?? null;
  }, [client, activeRoomId, entry.sender]);

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
    <div className={`group relative flex gap-3 ${showHeader ? 'mt-2' : 'mt-0.5'} px-2 py-0.5 hover:bg-[var(--color-hover-overlay-subtle)]`}>
      <div className="absolute right-4 top-0 z-10 hidden -translate-y-1/2 items-center gap-1 rounded-md bg-[var(--color-panel)] p-1 shadow-md group-hover:flex">
        {QUICK_REACTIONS.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => onReact(r)}
            className="rounded px-1 text-sm hover:bg-[var(--color-hover-overlay)]"
            title={`React with ${r}`}
          >
            {r}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            const k = prompt('Emoji');
            if (k) void onReact(k);
          }}
          className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-hover-overlay)] hover:text-[var(--color-text-strong)]"
          title="Custom reaction"
        >
          <SmilePlus className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setThreadRoot(entry.eventId)}
          className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-hover-overlay)] hover:text-[var(--color-text-strong)]"
          title="Reply in thread"
        >
          <MessageSquare className="h-4 w-4" />
        </button>
        {isMine && !entry.isRedacted && (
          <>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-hover-overlay)] hover:text-[var(--color-text-strong)]"
              title="Edit"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onRedact}
              className="rounded p-1 text-red-400 hover:bg-[var(--color-hover-overlay)]"
              title="Delete"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </>
        )}
        {!isMine && (
          <button
            type="button"
            onClick={() => {
              /* Reply flow lives in composer in a later pass. */
            }}
            className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-hover-overlay)] hover:text-[var(--color-text-strong)]"
            title="Reply"
          >
            <Reply className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="w-10 flex-shrink-0">
        {showHeader ? (
          <AuthedImage
            client={client}
            mxc={senderMxcAvatar}
            width={40}
            height={40}
            className="h-10 w-10 rounded-full bg-[var(--color-surface)]"
            fallback={<div className="h-10 w-10 rounded-full bg-[var(--color-accent)]" />}
          />
        ) : (
          <span className="invisible select-none text-[10px] text-[var(--color-text-faint)] group-hover:visible">
            {new Date(entry.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        {showHeader && (
          <div className="flex items-baseline gap-2">
            <span className="font-semibold text-[var(--color-text-strong)]">{entry.sender}</span>
            <span className="text-xs text-[var(--color-text-faint)]">
              {new Date(entry.ts).toLocaleString()}
            </span>
            {entry.isEncrypted && <Lock className="h-3 w-3 text-emerald-500" />}
          </div>
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
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="w-full rounded bg-[var(--color-surface)] p-2 text-sm text-[var(--color-text)] outline-none"
              rows={Math.min(8, Math.max(1, draft.split('\n').length))}
            />
            <div className="flex gap-2 text-xs">
              <button
                type="button"
                className="rounded bg-[var(--color-accent)] px-2 py-1 text-white"
                onClick={onSaveEdit}
              >
                Save
              </button>
              <button
                type="button"
                className="rounded bg-[var(--color-surface)] px-2 py-1 text-[var(--color-text)]"
                onClick={() => setEditing(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : isImage && client ? (
          <AuthedImage
            client={client}
            mxc={content.url}
            width={480}
            height={320}
            alt={content.body ?? ''}
            style={{ maxWidth: 480, maxHeight: 320, borderRadius: 8 }}
          />
        ) : isFile && client ? (
          <FileDownloadLink client={client} mxc={content.url!} label={content.body ?? 'file'} />
        ) : (
          <div
            className="prose dark:prose-invert max-w-none text-sm leading-relaxed text-[var(--color-text)] [&_a]:text-sky-400 [&_code]:rounded [&_code]:bg-[var(--color-code-bg)] [&_code]:px-1"
            dangerouslySetInnerHTML={{ __html: renderedHtml }}
          />
        )}
        {entry.editedFromId && (
          <span className="ml-1 text-[10px] text-[var(--color-text-faint)]" title="edited">
            (edited)
          </span>
        )}
        {Object.keys(entry.reactions).length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {Object.entries(entry.reactions).map(([key, info]) => (
              <span
                key={key}
                className={`rounded-full px-2 py-0.5 text-xs ${info.byMe ? 'bg-[var(--color-accent)] text-white' : 'bg-[var(--color-surface)] text-[var(--color-text-muted)]'}`}
              >
                {key} {info.count}
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
  label,
}: {
  client: NonNullable<ReturnType<typeof accountManager.getClient>>;
  mxc: string;
  label: string;
}) {
  const url = useAuthedMedia(client, mxc);
  if (!url) return <span className="text-[var(--color-text-muted)]">{label}</span>;
  return (
    <a href={url} download={label} target="_blank" rel="noopener" className="text-sky-400">
      {label}
    </a>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
