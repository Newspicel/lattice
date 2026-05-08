import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Pencil, Trash2, Upload } from 'lucide-react';
import type { MatrixClient } from 'matrix-js-sdk';
import { lookupShortcode } from '@/lib/emojiShortcodes';
import {
  type CustomEmoji,
  type EmoteUsage,
  addRoomEmoji,
  canonicaliseShortcode,
  maySendRoomEmotes,
  removeRoomEmoji,
  renameRoomEmoji,
  setRoomEmojiUsage,
  setRoomPackMeta,
  uploadEmojiImage,
} from '@/matrix/customEmojis';
import { useCustomEmojiStore, useRoomEmojiPacks } from '@/state/customEmojis';
import { useAccountsStore } from '@/state/accounts';
import { Button } from '@/ui/primitives/button';
import { Input } from '@/ui/primitives/input';
import { EmoteImage } from '@/ui/timeline/EmoteImage';

const ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const MAX_FILE_SIZE = 2 * 1024 * 1024;
const DEFAULT_STATE_KEY = '';

export function RoomEmojisPanel({
  client,
  roomId,
}: {
  client: MatrixClient;
  roomId: string;
}) {
  const accountId = useAccountsStore((s) => s.activeAccountId);
  const packs = useRoomEmojiPacks(accountId, roomId);
  const refreshRoomPacks = useCustomEmojiStore((s) => s.refreshRoomPacks);
  const room = client.getRoom(roomId);
  const canEdit = room ? maySendRoomEmotes(client, room) : false;
  const poke = () => {
    if (accountId) refreshRoomPacks(accountId, roomId, client);
  };

  // Default pack at empty state-key. v1 only edits the default pack; multiple
  // named packs are read but not editable here.
  const defaultPack = packs.find((p) => p.source.kind === 'room' && p.source.stateKey === DEFAULT_STATE_KEY);
  const items = defaultPack
    ? [...defaultPack.emoticons, ...defaultPack.stickers]
    : [];
  const seen = new Set<string>();
  const dedup: CustomEmoji[] = [];
  for (const e of items) {
    if (seen.has(e.shortcode)) continue;
    seen.add(e.shortcode);
    dedup.push(e);
  }

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
        Emojis &amp; Stickers
      </h3>
      <p className="text-xs text-[var(--color-text-muted)]">
        Custom emojis published in this room are available to anyone composing here.
      </p>
      {!canEdit && (
        <p className="border border-amber-700/40 bg-amber-900/10 px-3 py-2 text-xs text-[var(--color-text-muted)]">
          You don’t have permission to edit this room’s emoji pack.
        </p>
      )}
      {canEdit && (
        <>
          <PackMetaForm
            client={client}
            roomId={roomId}
            displayName={defaultPack?.displayName ?? ''}
            attribution={defaultPack?.attribution ?? ''}
            onChanged={poke}
          />
          <UploadForm
            client={client}
            roomId={roomId}
            existingShortcodes={dedup.map((e) => e.shortcode)}
            onChanged={poke}
          />
        </>
      )}
      {dedup.length === 0 ? (
        <p className="text-xs text-[var(--color-text-muted)]">
          No custom emojis in this room yet.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {dedup.map((emoji) => (
            <EmojiCard
              key={`${emoji.shortcode}-${emoji.mxc}`}
              client={client}
              roomId={roomId}
              emoji={emoji}
              canEdit={canEdit}
              onChanged={poke}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function PackMetaForm({
  client,
  roomId,
  displayName,
  attribution,
  onChanged,
}: {
  client: MatrixClient;
  roomId: string;
  displayName: string;
  attribution: string;
  onChanged: () => void;
}) {
  const [name, setName] = useState(displayName);
  const [attr, setAttr] = useState(attribution);
  const [busy, setBusy] = useState(false);

  useEffect(() => setName(displayName), [displayName]);
  useEffect(() => setAttr(attribution), [attribution]);

  async function onSave() {
    setBusy(true);
    try {
      await setRoomPackMeta(client, roomId, DEFAULT_STATE_KEY, {
        display_name: name.trim(),
        attribution: attr.trim(),
      });
      onChanged();
      toast.success('Pack info saved.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 border border-[var(--color-divider)] bg-[var(--color-panel-2)] p-3">
      <label className="flex flex-col gap-1 text-xs">
        <span className="text-[var(--color-text-muted)]">Pack display name</span>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Room emojis"
          disabled={busy}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        <span className="text-[var(--color-text-muted)]">Attribution (optional)</span>
        <Input value={attr} onChange={(e) => setAttr(e.target.value)} disabled={busy} />
      </label>
      <Button onClick={onSave} disabled={busy} size="sm" className="self-start">
        {busy ? 'Saving…' : 'Save'}
      </Button>
    </div>
  );
}

function UploadForm({
  client,
  roomId,
  existingShortcodes,
  onChanged,
}: {
  client: MatrixClient;
  roomId: string;
  existingShortcodes: string[];
  onChanged: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [shortcode, setShortcode] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  const cleaned = canonicaliseShortcode(shortcode);
  const collidesUnicode = cleaned ? lookupShortcode(cleaned) !== null : false;
  const collidesSelf = cleaned ? existingShortcodes.includes(cleaned) : false;

  function pickFile(f: File | null) {
    if (!f) return;
    if (!ALLOWED_MIME.includes(f.type)) {
      toast.error('Use PNG, JPEG, GIF, or WebP.');
      return;
    }
    if (f.size > MAX_FILE_SIZE) {
      toast.error('Image must be under 2 MB.');
      return;
    }
    setFile(f);
    if (!shortcode) {
      const stem = f.name.replace(/\.[^.]+$/, '').toLowerCase();
      const candidate = canonicaliseShortcode(stem);
      if (candidate) setShortcode(candidate);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !cleaned) return;
    setBusy(true);
    try {
      const { mxc, info } = await uploadEmojiImage(client, file);
      // Default new room uploads to both usages so a single upload works
      // as an inline emoticon AND a sticker.
      await addRoomEmoji(client, roomId, DEFAULT_STATE_KEY, cleaned, {
        url: mxc,
        info,
        usage: ['emoticon', 'sticker'],
      });
      onChanged();
      toast.success(`Added :${cleaned}: to the room.`);
      setFile(null);
      setShortcode('');
      if (fileRef.current) fileRef.current.value = '';
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-3 border border-[var(--color-divider)] bg-[var(--color-panel-2)] p-3"
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex h-16 w-16 shrink-0 items-center justify-center border border-dashed border-[var(--color-divider)] bg-[var(--color-panel)] text-[var(--color-text-muted)] hover:border-[var(--color-text-faint)] hover:text-[var(--color-text-strong)]"
          aria-label="Choose image"
        >
          {previewUrl ? (
            <img src={previewUrl} alt="" className="max-h-full max-w-full object-contain" />
          ) : (
            <Upload className="h-5 w-5" strokeWidth={1.75} />
          )}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept={ALLOWED_MIME.join(',')}
          hidden
          onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-[var(--color-text-muted)]">Shortcode</span>
            <div className="flex items-center gap-1">
              <span className="text-[var(--color-text-muted)]">:</span>
              <Input
                value={shortcode}
                onChange={(e) => setShortcode(e.target.value)}
                placeholder="party_parrot"
                disabled={busy}
              />
              <span className="text-[var(--color-text-muted)]">:</span>
            </div>
          </label>
          <p className="text-xs text-[var(--color-text-muted)]">
            Available as both an inline emoticon and a sticker. Toggle per-image below.
          </p>
          {shortcode && !cleaned && (
            <p className="text-xs text-amber-400">
              Shortcodes must be 2–32 lowercase letters, digits, _, +, or -.
            </p>
          )}
          {collidesUnicode && (
            <p className="text-xs text-amber-400">
              Note: there’s a built-in unicode emoji with this shortcode.
            </p>
          )}
          {collidesSelf && (
            <p className="text-xs text-amber-400">
              An emoji with this shortcode already exists — saving will overwrite it.
            </p>
          )}
        </div>
      </div>
      <Button type="submit" disabled={!file || !cleaned || busy} size="sm" className="self-start">
        {busy ? 'Uploading…' : 'Add to room'}
      </Button>
    </form>
  );
}

function EmojiCard({
  client,
  roomId,
  emoji,
  canEdit,
  onChanged,
}: {
  client: MatrixClient;
  roomId: string;
  emoji: CustomEmoji;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(emoji.shortcode);
  const [busy, setBusy] = useState(false);

  async function onRename() {
    const cleaned = canonicaliseShortcode(draft);
    if (!cleaned) {
      toast.error('Invalid shortcode.');
      return;
    }
    setBusy(true);
    try {
      await renameRoomEmoji(client, roomId, DEFAULT_STATE_KEY, emoji.shortcode, cleaned);
      onChanged();
      toast.success(`Renamed to :${cleaned}:`);
      setRenaming(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!confirm(`Delete :${emoji.shortcode}: from this room?`)) return;
    setBusy(true);
    try {
      await removeRoomEmoji(client, roomId, DEFAULT_STATE_KEY, emoji.shortcode);
      onChanged();
      toast.success(`Deleted :${emoji.shortcode}:`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onToggleUsage(target: EmoteUsage) {
    const next = emoji.usage.includes(target)
      ? emoji.usage.filter((u) => u !== target)
      : [...emoji.usage, target];
    if (next.length === 0) {
      toast.error('At least one usage must be set.');
      return;
    }
    setBusy(true);
    try {
      await setRoomEmojiUsage(client, roomId, DEFAULT_STATE_KEY, emoji.shortcode, next);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2 border border-[var(--color-divider)] bg-[var(--color-panel-2)] p-2">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center bg-[var(--color-panel)]">
        <EmoteImage client={client} mxc={emoji.mxc} alt={`:${emoji.shortcode}:`} size={28} />
      </div>
      <div className="min-w-0 flex-1">
        {renaming ? (
          <div className="flex items-center gap-1">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={busy}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void onRename();
                else if (e.key === 'Escape') setRenaming(false);
              }}
            />
            <Button size="xs" onClick={onRename} disabled={busy}>
              Save
            </Button>
          </div>
        ) : (
          <div className="truncate font-mono text-xs">:{emoji.shortcode}:</div>
        )}
        {canEdit && (
          <div className="mt-1 flex gap-1 text-[10px] text-[var(--color-text-muted)]">
            <button
              type="button"
              onClick={() => onToggleUsage('emoticon')}
              disabled={busy}
              className={emoji.usage.includes('emoticon') ? 'text-[var(--color-text-strong)] underline' : ''}
            >
              emoticon
            </button>
            <span>·</span>
            <button
              type="button"
              onClick={() => onToggleUsage('sticker')}
              disabled={busy}
              className={emoji.usage.includes('sticker') ? 'text-[var(--color-text-strong)] underline' : ''}
            >
              sticker
            </button>
          </div>
        )}
      </div>
      {canEdit && (
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => {
              setDraft(emoji.shortcode);
              setRenaming((v) => !v);
            }}
            disabled={busy}
            aria-label="Rename"
            className="flex h-6 w-6 items-center justify-center text-[var(--color-text-muted)] hover:bg-[var(--color-hover-overlay)] hover:text-[var(--color-text-strong)]"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            aria-label="Delete"
            className="flex h-6 w-6 items-center justify-center text-red-400 hover:bg-red-500/20"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
