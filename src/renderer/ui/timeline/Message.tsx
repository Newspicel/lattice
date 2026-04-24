import { useMemo, useState } from 'react';
import { Lock, SmilePlus, Reply, Pencil, Trash2, MessageSquare } from 'lucide-react';
import type { TimelineEntry } from '@/state/timeline';
import { sanitizeEventHtml } from '@/lib/markdown';
import { useAccountsStore } from '@/state/accounts';
import { useUiStore } from '@/state/ui';
import { accountManager } from '@/matrix/AccountManager';
import { mxcToHttp } from '@/lib/mxc';
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

  const renderedHtml = useMemo(() => {
    if (entry.isRedacted) return '<em class="text-neutral-500">[redacted]</em>';
    if (entry.isDecryptionFailure)
      return '<em class="text-amber-400">[unable to decrypt]</em>';

    const content = entry.content as {
      msgtype?: string;
      body?: string;
      format?: string;
      formatted_body?: string;
      url?: string;
    };

    if (content.format === 'org.matrix.custom.html' && content.formatted_body) {
      return sanitizeEventHtml(content.formatted_body);
    }
    if (content.msgtype === 'm.image' && content.url && client) {
      const url = mxcToHttp(client, content.url, 480, 320);
      return `<img src="${url ?? ''}" alt="${escapeHtml(content.body ?? '')}" style="max-width:480px;max-height:320px;border-radius:8px" />`;
    }
    if (content.msgtype === 'm.file' && content.url && client) {
      const url = mxcToHttp(client, content.url);
      return `<a href="${url ?? ''}" target="_blank" rel="noopener">${escapeHtml(content.body ?? 'file')}</a>`;
    }
    return escapeHtml(content.body ?? '');
  }, [entry, client]);

  const avatarUrl = useMemo(() => {
    if (!client) return null;
    const room = useAccountsStore.getState().activeRoomId
      ? client.getRoom(useAccountsStore.getState().activeRoomId!)
      : null;
    const member = room?.getMember(entry.sender);
    return mxcToHttp(client, member?.getMxcAvatarUrl() ?? null, 40, 40);
  }, [entry.sender, client]);

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
    <div className={`group relative flex gap-3 ${showHeader ? 'mt-2' : 'mt-0.5'} px-2 py-0.5 hover:bg-white/[0.02]`}>
      <div className="absolute right-4 top-0 z-10 hidden -translate-y-1/2 items-center gap-1 rounded-md bg-[var(--color-panel)] p-1 shadow-md group-hover:flex">
        {QUICK_REACTIONS.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => onReact(r)}
            className="rounded px-1 text-sm hover:bg-white/10"
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
          className="rounded p-1 text-neutral-400 hover:bg-white/10 hover:text-white"
          title="Custom reaction"
        >
          <SmilePlus className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setThreadRoot(entry.eventId)}
          className="rounded p-1 text-neutral-400 hover:bg-white/10 hover:text-white"
          title="Reply in thread"
        >
          <MessageSquare className="h-4 w-4" />
        </button>
        {isMine && !entry.isRedacted && (
          <>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded p-1 text-neutral-400 hover:bg-white/10 hover:text-white"
              title="Edit"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onRedact}
              className="rounded p-1 text-red-400 hover:bg-white/10"
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
            className="rounded p-1 text-neutral-400 hover:bg-white/10 hover:text-white"
            title="Reply"
          >
            <Reply className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="w-10 flex-shrink-0">
        {showHeader ? (
          avatarUrl ? (
            // eslint-disable-next-line jsx-a11y/alt-text
            <img src={avatarUrl} className="h-10 w-10 rounded-full bg-neutral-700" />
          ) : (
            <div className="h-10 w-10 rounded-full bg-[var(--color-accent)]" />
          )
        ) : (
          <span className="invisible select-none text-[10px] text-neutral-500 group-hover:visible">
            {new Date(entry.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        {showHeader && (
          <div className="flex items-baseline gap-2">
            <span className="font-semibold text-white">{entry.sender}</span>
            <span className="text-xs text-neutral-500">
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
              className="w-full rounded bg-[var(--color-surface)] p-2 text-sm text-neutral-100 outline-none"
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
                className="rounded bg-[var(--color-surface)] px-2 py-1 text-neutral-200"
                onClick={() => setEditing(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div
            className="prose prose-invert max-w-none text-sm leading-relaxed text-neutral-100 [&_a]:text-sky-400 [&_code]:rounded [&_code]:bg-black/40 [&_code]:px-1"
            dangerouslySetInnerHTML={{ __html: renderedHtml }}
          />
        )}
        {entry.editedFromId && (
          <span className="ml-1 text-[10px] text-neutral-500" title="edited">
            (edited)
          </span>
        )}
        {Object.keys(entry.reactions).length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {Object.entries(entry.reactions).map(([key, info]) => (
              <span
                key={key}
                className={`rounded-full px-2 py-0.5 text-xs ${info.byMe ? 'bg-[var(--color-accent)] text-white' : 'bg-[var(--color-surface)] text-neutral-300'}`}
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
