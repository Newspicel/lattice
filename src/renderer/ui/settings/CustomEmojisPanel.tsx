import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Pencil, Trash2, Upload } from 'lucide-react';
import type { MatrixClient } from 'matrix-js-sdk';
import { lookupShortcode } from '@/lib/emojiShortcodes';
import {
  type CustomEmoji,
  type EmoteUsage,
  addUserEmoji,
  canonicaliseShortcode,
  removeUserEmoji,
  renameUserEmoji,
  setUserEmojiUsage,
  setUserPackMeta,
  uploadEmojiImage,
} from '@/matrix/customEmojis';
import { useCustomEmojiStore, useUserEmojiPack } from '@/state/customEmojis';
import { Button } from '@/ui/primitives/button';
import { Input } from '@/ui/primitives/input';
import { EmoteImage } from '@/ui/timeline/EmoteImage';
import { EmojiSourcesPanel } from './EmojiSourcesPanel';
import { SettingsPanel, SettingsSection } from './SettingsPrimitives';

const ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const MAX_FILE_SIZE = 2 * 1024 * 1024;

type SubTab = 'emoticons' | 'stickers' | 'sources';

export function CustomEmojisPanel({
  accountId,
  client,
}: {
  accountId: string;
  client: MatrixClient | null;
}) {
  const pack = useUserEmojiPack(accountId);
  const refreshUserPack = useCustomEmojiStore((s) => s.refreshUserPack);
  const [tab, setTab] = useState<SubTab>('emoticons');

  // The matrix-js-sdk fires `ClientEvent.AccountData` before `setAccountData`
  // resolves, but we explicitly refresh after every mutation as a defence
  // against any timing edge case (e.g. listener attached after the echo, or
  // an aborted sync round-trip).
  function poke() {
    if (client) refreshUserPack(accountId, client);
  }

  if (!client) {
    return (
      <SettingsPanel title="Custom Emojis">
        <p className="text-sm text-[var(--color-text-muted)]">
          Account is not connected.
        </p>
      </SettingsPanel>
    );
  }

  return (
    <SettingsPanel title="Custom Emojis">
      <div className="flex border border-[var(--color-divider)]">
        {(
          [
            ['emoticons', 'Emoticons'],
            ['stickers', 'Stickers'],
            ['sources', 'Sources'],
          ] as Array<[SubTab, string]>
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            aria-current={tab === id ? 'page' : undefined}
            className={`flex h-8 flex-1 items-center justify-center text-xs font-medium transition-colors ${
              tab === id
                ? 'bg-[var(--color-surface)] text-[var(--color-text-strong)]'
                : 'text-[var(--color-text-muted)] hover:bg-[var(--color-hover-overlay)] hover:text-[var(--color-text-strong)]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'emoticons' && (
        <PackEditor
          client={client}
          pack={pack}
          usage="emoticon"
          emptyHint="No custom emoticons yet. Upload one to use :shortcodes: in messages."
          onChanged={poke}
        />
      )}
      {tab === 'stickers' && (
        <PackEditor
          client={client}
          pack={pack}
          usage="sticker"
          emptyHint="No stickers yet. Upload an image to send as a sticker."
          onChanged={poke}
        />
      )}
      {tab === 'sources' && <EmojiSourcesPanel accountId={accountId} client={client} />}
    </SettingsPanel>
  );
}

function PackEditor({
  client,
  pack,
  usage,
  emptyHint,
  onChanged,
}: {
  client: MatrixClient;
  pack: ReturnType<typeof useUserEmojiPack>;
  usage: EmoteUsage;
  emptyHint: string;
  onChanged: () => void;
}) {
  const items = usage === 'emoticon' ? pack?.emoticons ?? [] : pack?.stickers ?? [];

  return (
    <>
      <SettingsSection label="Pack metadata">
        <PackMetaForm client={client} pack={pack} onChanged={onChanged} />
      </SettingsSection>

      <SettingsSection label={usage === 'emoticon' ? 'Add emoticon' : 'Add sticker'}>
        <UploadForm
          client={client}
          usage={usage}
          existingShortcodes={items.map((e) => e.shortcode)}
          onChanged={onChanged}
        />
      </SettingsSection>

      <SettingsSection label={usage === 'emoticon' ? 'Your emoticons' : 'Your stickers'}>
        {items.length === 0 ? (
          <p className="text-xs text-[var(--color-text-muted)]">{emptyHint}</p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {items.map((emoji) => (
              <EmojiCard
                key={`${emoji.shortcode}-${emoji.mxc}`}
                client={client}
                emoji={emoji}
                onChanged={onChanged}
              />
            ))}
          </div>
        )}
      </SettingsSection>
    </>
  );
}

function PackMetaForm({
  client,
  pack,
  onChanged,
}: {
  client: MatrixClient;
  pack: ReturnType<typeof useUserEmojiPack>;
  onChanged: () => void;
}) {
  const [displayName, setDisplayName] = useState(pack?.displayName === 'My emojis' ? '' : pack?.displayName ?? '');
  const [attribution, setAttribution] = useState(pack?.attribution ?? '');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDisplayName(pack?.displayName === 'My emojis' ? '' : pack?.displayName ?? '');
    setAttribution(pack?.attribution ?? '');
  }, [pack?.displayName, pack?.attribution]);

  async function onSave() {
    setBusy(true);
    try {
      await setUserPackMeta(client, {
        display_name: displayName.trim(),
        attribution: attribution.trim(),
      });
      onChanged();
      toast.success('Pack metadata saved.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 border border-[var(--color-divider)] bg-[var(--color-panel-2)] p-3">
      <label className="flex flex-col gap-1 text-xs">
        <span className="text-[var(--color-text-muted)]">Display name</span>
        <Input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="My emojis"
          disabled={busy}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        <span className="text-[var(--color-text-muted)]">Attribution (optional)</span>
        <Input
          value={attribution}
          onChange={(e) => setAttribution(e.target.value)}
          placeholder="e.g. Created by …"
          disabled={busy}
        />
      </label>
      <Button onClick={onSave} disabled={busy} size="sm" className="self-start">
        {busy ? 'Saving…' : 'Save'}
      </Button>
    </div>
  );
}

function UploadForm({
  client,
  usage,
  existingShortcodes,
  onChanged,
}: {
  client: MatrixClient;
  usage: EmoteUsage;
  existingShortcodes: string[];
  onChanged: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [shortcode, setShortcode] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const previewUrl = useMemo(() => {
    if (!file) return null;
    return URL.createObjectURL(file);
  }, [file]);
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

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
      // Default new uploads to both usages so a single upload is usable as
      // an inline emoticon (`:name:` in messages) AND as a sticker. The user
      // can narrow it down per-card via the usage toggles afterwards.
      await addUserEmoji(client, cleaned, {
        url: mxc,
        info,
        usage: ['emoticon', 'sticker'],
      });
      onChanged();
      toast.success(`Added :${cleaned}:`);
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
                placeholder="my_emoji"
                disabled={busy}
              />
              <span className="text-[var(--color-text-muted)]">:</span>
            </div>
          </label>
          {shortcode && !cleaned && (
            <p className="text-xs text-amber-400">
              Shortcodes must be 2–32 lowercase letters, digits, _, +, or -.
            </p>
          )}
          {collidesUnicode && (
            <p className="text-xs text-amber-400">
              Heads up: there’s a built-in unicode emoji with this shortcode. Yours
              will take priority for you, but other clients may render the unicode.
            </p>
          )}
          {collidesSelf && (
            <p className="text-xs text-amber-400">
              You already have an emoji with this shortcode — saving will overwrite it.
            </p>
          )}
        </div>
      </div>
      <Button
        type="submit"
        disabled={!file || !cleaned || busy}
        size="sm"
        className="self-start"
      >
        {busy ? 'Uploading…' : usage === 'emoticon' ? 'Add emoticon' : 'Add sticker'}
      </Button>
    </form>
  );
}

function EmojiCard({
  client,
  emoji,
  onChanged,
}: {
  client: MatrixClient;
  emoji: CustomEmoji;
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
      await renameUserEmoji(client, emoji.shortcode, cleaned);
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
    if (!confirm(`Delete :${emoji.shortcode}:?`)) return;
    setBusy(true);
    try {
      await removeUserEmoji(client, emoji.shortcode);
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
      await setUserEmojiUsage(client, emoji.shortcode, next);
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
      </div>
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
    </div>
  );
}
