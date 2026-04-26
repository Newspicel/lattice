import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { RoomMessageEventContent } from 'matrix-js-sdk/lib/@types/events';
import { Paperclip, SendHorizontal, X, FileIcon, ImageIcon, Smile } from 'lucide-react';
import { accountManager } from '@/matrix/AccountManager';
import { useAccountsStore } from '@/state/accounts';
import { composeTextContent } from '@/lib/markdown';
import { uploadAndSendFile } from '@/matrix/attachments';
import { Button } from '@/ui/primitives/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/primitives/tooltip';
import { EmojiPicker } from '@/ui/primitives/emoji-picker';
import {
  detectActiveShortcode,
  replaceShortcodeAtCursor,
  replaceShortcodes,
  searchShortcodes,
  type ShortcodeMatch,
} from '@/lib/emojiShortcodes';

interface PendingAttachment {
  id: string;
  file: File;
  previewUrl: string | null;
}

function makePending(file: File): PendingAttachment {
  const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
  return { id: crypto.randomUUID(), file, previewUrl };
}

// Maximum auto-grow height for the textarea (Discord-style cap).
// Roughly 12 lines at our default line-height; scroll kicks in past this.
const COMPOSER_MAX_HEIGHT = 240;

export function Composer() {
  const [value, setValue] = useState('');
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [acState, setAcState] = useState<{
    open: boolean;
    query: string;
    start: number;
    index: number;
    results: ShortcodeMatch[];
  }>({ open: false, query: '', start: 0, index: 0, results: [] });
  const activeAccountId = useAccountsStore((s) => s.activeAccountId);
  const activeRoomId = useAccountsStore((s) => s.activeRoomId);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const disabled = !activeAccountId || !activeRoomId;

  useLayoutEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    const next = Math.min(ta.scrollHeight, COMPOSER_MAX_HEIGHT);
    ta.style.height = `${next}px`;
    ta.style.overflowY = ta.scrollHeight > COMPOSER_MAX_HEIGHT ? 'auto' : 'hidden';
  }, [value]);

  useEffect(() => {
    return () => {
      for (const a of attachments) {
        if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
      }
    };
  }, [attachments]);

  useEffect(() => {
    setAttachments((prev) => {
      for (const a of prev) {
        if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
      }
      return [];
    });
    setValue('');
    setAcState((s) => ({ ...s, open: false }));
  }, [activeRoomId, activeAccountId]);

  function updateAutocomplete(text: string, cursor: number) {
    const detected = detectActiveShortcode(text, cursor);
    if (!detected) {
      setAcState((s) => (s.open ? { ...s, open: false } : s));
      return;
    }
    const results = searchShortcodes(detected.query, 8);
    if (results.length === 0) {
      setAcState((s) => (s.open ? { ...s, open: false } : s));
      return;
    }
    setAcState({
      open: true,
      query: detected.query,
      start: detected.start,
      index: 0,
      results,
    });
  }

  function applyAutocomplete(match: ShortcodeMatch) {
    const ta = textareaRef.current;
    const cursor = ta?.selectionStart ?? value.length;
    const next =
      value.slice(0, acState.start) + match.emoji + value.slice(cursor);
    const newCursor = acState.start + match.emoji.length;
    setValue(next);
    setAcState((s) => ({ ...s, open: false }));
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(newCursor, newCursor);
    });
  }

  async function send() {
    if (disabled) return;
    const client = accountManager.getClient(activeAccountId!);
    if (!client) return;
    const body = replaceShortcodes(value).trim();
    const pending = attachments;
    if (!body && pending.length === 0) return;

    setValue('');
    setAttachments([]);

    try {
      for (const a of pending) {
        await uploadAndSendFile(client, activeRoomId!, a.file);
        if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
      }
      if (body) {
        const content = composeTextContent(body) as unknown as RoomMessageEventContent;
        await client.sendMessage(activeRoomId!, content);
      }
    } catch (err) {
      console.error('send failed', err);
      // Restore so the user doesn't lose their draft on transient failure.
      setValue((cur) => cur || body);
      setAttachments((cur) => (cur.length > 0 ? cur : pending));
    }
  }

  function addFiles(files: Iterable<File>) {
    const next: PendingAttachment[] = [];
    for (const f of files) next.push(makePending(f));
    if (next.length === 0) return;
    setAttachments((cur) => [...cur, ...next]);
  }

  function removeAttachment(id: string) {
    setAttachments((cur) => {
      const match = cur.find((a) => a.id === id);
      if (match?.previewUrl) URL.revokeObjectURL(match.previewUrl);
      return cur.filter((a) => a.id !== id);
    });
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (files && files.length > 0) addFiles(Array.from(files));
    e.target.value = '';
  }

  function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(e.clipboardData.files);
    if (files.length === 0) return;
    e.preventDefault();
    addFiles(files);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (acState.open && acState.results.length > 0) {
      if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) {
        e.preventDefault();
        setAcState((s) => ({
          ...s,
          index: (s.index + 1) % s.results.length,
        }));
        return;
      }
      if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) {
        e.preventDefault();
        setAcState((s) => ({
          ...s,
          index: (s.index - 1 + s.results.length) % s.results.length,
        }));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const match = acState.results[acState.index];
        if (match) applyAutocomplete(match);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setAcState((s) => ({ ...s, open: false }));
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  function insertEmoji(emoji: string) {
    const ta = textareaRef.current;
    const start = ta?.selectionStart ?? value.length;
    const end = ta?.selectionEnd ?? value.length;
    const next = value.slice(0, start) + emoji + value.slice(end);
    setValue(next);
    // Restore caret right after the inserted emoji.
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      const caret = start + emoji.length;
      el.setSelectionRange(caret, caret);
    });
  }

  const canSend = !disabled && (value.trim().length > 0 || attachments.length > 0);

  return (
    <div className="shrink-0 border-t border-[var(--color-divider)] bg-[var(--color-panel-2)] p-3">
      <div
        className={`relative flex flex-col gap-2 border border-[var(--color-divider)] bg-[var(--color-panel)] px-3 py-2 transition-colors focus-within:border-[var(--color-text-faint)] ${
          disabled ? 'opacity-50' : ''
        }`}
      >
        {acState.open && acState.results.length > 0 && (
          <div className="absolute bottom-full left-0 right-0 mb-1 z-30 max-h-64 overflow-y-auto border border-[var(--color-divider)] bg-[var(--color-panel-2)] shadow-lg">
            <div className="border-b border-[var(--color-divider)] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
              Emoji matching :{acState.query}
            </div>
            {acState.results.map((r, i) => (
              <button
                key={r.code}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  applyAutocomplete(r);
                }}
                onMouseEnter={() =>
                  setAcState((s) => ({ ...s, index: i }))
                }
                className={`flex w-full items-center gap-3 px-3 py-1.5 text-left text-sm transition-colors ${
                  i === acState.index
                    ? 'bg-[var(--color-hover-overlay)] text-[var(--color-text-strong)]'
                    : 'text-[var(--color-text)]'
                }`}
              >
                <span className="text-xl leading-none">{r.emoji}</span>
                <span className="font-mono text-xs text-[var(--color-text-muted)]">
                  :{r.code}:
                </span>
              </button>
            ))}
          </div>
        )}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {attachments.map((a) => (
              <AttachmentChip
                key={a.id}
                attachment={a}
                onRemove={() => removeAttachment(a.id)}
              />
            ))}
          </div>
        )}
        <div className="flex items-end gap-2">
          <Tooltip>
            <TooltipTrigger
              render={
                <label
                  className={`mb-0.5 flex h-7 w-7 shrink-0 items-center justify-center text-[var(--color-text-muted)] transition-colors ${
                    disabled
                      ? 'cursor-not-allowed'
                      : 'cursor-pointer hover:bg-[var(--color-hover-overlay)] hover:text-[var(--color-text-strong)]'
                  }`}
                />
              }
            >
              <Paperclip className="h-4 w-4" strokeWidth={1.75} />
              <input
                type="file"
                multiple
                className="hidden"
                onChange={onFileChange}
                disabled={disabled}
              />
            </TooltipTrigger>
            <TooltipContent>Attach file</TooltipContent>
          </Tooltip>
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => {
              const next = e.target.value;
              const ta = e.target;
              const cursor = ta.selectionStart ?? next.length;
              const replaced = replaceShortcodeAtCursor(next, cursor);
              if (replaced) {
                setValue(replaced.text);
                setAcState((s) => ({ ...s, open: false }));
                requestAnimationFrame(() => {
                  const el = textareaRef.current;
                  if (!el) return;
                  el.setSelectionRange(replaced.cursor, replaced.cursor);
                });
              } else {
                setValue(next);
                updateAutocomplete(next, cursor);
              }
            }}
            onKeyUp={(e) => {
              if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                const ta = e.currentTarget;
                updateAutocomplete(ta.value, ta.selectionStart ?? ta.value.length);
              }
            }}
            onClick={(e) => {
              const ta = e.currentTarget;
              updateAutocomplete(ta.value, ta.selectionStart ?? ta.value.length);
            }}
            onBlur={() => {
              setAcState((s) => (s.open ? { ...s, open: false } : s));
            }}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            disabled={disabled}
            placeholder={disabled ? 'Select a chat to send messages' : 'Message'}
            rows={1}
            className="flex-1 resize-none bg-transparent py-1.5 text-sm leading-5 text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-faint)] disabled:cursor-not-allowed"
          />
          <EmojiPicker
            open={emojiOpen}
            onOpenChange={(o) => setEmojiOpen(o && !disabled)}
            onSelect={(emoji) => {
              insertEmoji(emoji);
            }}
            trigger={
              <button
                type="button"
                disabled={disabled}
                aria-label="Insert emoji"
                className={`mb-0.5 flex h-7 w-7 shrink-0 items-center justify-center text-[var(--color-text-muted)] transition-colors aria-expanded:bg-[var(--color-hover-overlay)] aria-expanded:text-[var(--color-text-strong)] ${
                  disabled
                    ? 'cursor-not-allowed'
                    : 'hover:bg-[var(--color-hover-overlay)] hover:text-[var(--color-text-strong)]'
                }`}
              >
                <Smile className="h-4 w-4" strokeWidth={1.75} />
              </button>
            }
          />
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  onClick={send}
                  disabled={!canSend}
                  variant={canSend ? 'default' : 'ghost'}
                  size="icon-sm"
                  aria-label="Send message"
                  className="mb-0.5"
                />
              }
            >
              <SendHorizontal className="h-4 w-4" />
            </TooltipTrigger>
            <TooltipContent>Send</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}

function AttachmentChip({
  attachment,
  onRemove,
}: {
  attachment: PendingAttachment;
  onRemove: () => void;
}) {
  const { file, previewUrl } = attachment;
  const isImage = file.type.startsWith('image/');
  return (
    <div className="group relative flex items-center gap-2 border border-[var(--color-divider)] bg-[var(--color-panel-2)] px-2 py-1.5 pr-7 text-xs">
      {isImage && previewUrl ? (
        <img
          src={previewUrl}
          alt={file.name}
          className="h-10 w-10 shrink-0 object-cover"
        />
      ) : (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center bg-[var(--color-surface)] text-[var(--color-text-muted)]">
          {isImage ? <ImageIcon className="h-4 w-4" strokeWidth={1.75} /> : <FileIcon className="h-4 w-4" strokeWidth={1.75} />}
        </div>
      )}
      <div className="max-w-[180px]">
        <div className="truncate font-medium text-[var(--color-text)]">{file.name}</div>
        <div className="font-mono text-[10px] tabular-nums text-[var(--color-text-faint)]">
          {formatBytes(file.size)}
        </div>
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center bg-[var(--color-surface)] text-[var(--color-text-muted)] transition-colors hover:bg-red-500 hover:text-white"
        aria-label={`Remove ${file.name}`}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
