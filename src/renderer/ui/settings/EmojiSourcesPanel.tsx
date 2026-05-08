import { useState } from 'react';
import { toast } from 'sonner';
import type { MatrixClient } from 'matrix-js-sdk';
import { disableEmoteRoom, enableEmoteRoom } from '@/matrix/customEmojis';
import { useCustomEmojiStore, useDiscoverableRoomPacks } from '@/state/customEmojis';
import { AuthedImage } from '@/lib/mxc';
import { EmoteImage } from '@/ui/timeline/EmoteImage';
import { SettingsSection } from './SettingsPrimitives';

export function EmojiSourcesPanel({
  accountId,
  client,
}: {
  accountId: string;
  client: MatrixClient;
}) {
  const discoverable = useDiscoverableRoomPacks(accountId, client);
  const refreshEmoteRooms = useCustomEmojiStore((s) => s.refreshEmoteRooms);
  const poke = () => refreshEmoteRooms(accountId, client);

  return (
    <>
      <SettingsSection label="About">
        <p className="text-xs text-[var(--color-text-muted)]">
          Rooms can publish their own emoji packs. Enable a room here to use
          its emojis everywhere — not just inside that room.
        </p>
      </SettingsSection>

      <SettingsSection label="Available room packs">
        {discoverable.length === 0 ? (
          <p className="text-xs text-[var(--color-text-muted)]">
            None of the rooms you’re in have published an emoji pack yet.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {discoverable.map((entry) => (
              <PackRow
                key={`${entry.pack.source.kind === 'room' ? entry.pack.source.roomId : ''}::${
                  entry.pack.source.kind === 'room' ? entry.pack.source.stateKey : ''
                }`}
                client={client}
                roomName={entry.roomName}
                pack={entry.pack}
                enabled={entry.enabled}
                onChanged={poke}
              />
            ))}
          </div>
        )}
      </SettingsSection>
    </>
  );
}

function PackRow({
  client,
  roomName,
  pack,
  enabled,
  onChanged,
}: {
  client: MatrixClient;
  roomName: string;
  pack: ReturnType<typeof useDiscoverableRoomPacks>[number]['pack'];
  enabled: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);

  if (pack.source.kind !== 'room') return null;
  const { roomId, stateKey } = pack.source;

  async function toggle() {
    setBusy(true);
    try {
      if (enabled) await disableEmoteRoom(client, roomId, stateKey);
      else await enableEmoteRoom(client, roomId, stateKey);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const total = pack.emoticons.length + pack.stickers.length;
  return (
    <div className="flex items-center gap-3 border border-[var(--color-divider)] bg-[var(--color-panel-2)] p-2">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center bg-[var(--color-panel)]">
        {pack.avatarMxc ? (
          <AuthedImage
            client={client}
            mxc={pack.avatarMxc}
            width={64}
            height={64}
            className="h-8 w-8 object-contain"
            fallback={<PackFallback pack={pack} client={client} />}
          />
        ) : (
          <PackFallback pack={pack} client={client} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-[var(--color-text-strong)]">
          {pack.displayName}
        </div>
        <div className="truncate text-xs text-[var(--color-text-muted)]">
          {roomName} · {pack.emoticons.length} emoticon
          {pack.emoticons.length === 1 ? '' : 's'} · {pack.stickers.length} sticker
          {pack.stickers.length === 1 ? '' : 's'}
          {total === 0 ? ' (empty)' : ''}
        </div>
      </div>
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        aria-pressed={enabled}
        className={`flex h-7 items-center px-2.5 text-xs font-medium transition-colors ${
          enabled
            ? 'bg-[var(--color-text-strong)] text-[var(--color-panel)]'
            : 'border border-[var(--color-divider)] text-[var(--color-text-muted)] hover:border-[var(--color-text-faint)] hover:text-[var(--color-text-strong)]'
        }`}
      >
        {enabled ? 'Enabled' : 'Enable'}
      </button>
    </div>
  );
}

function PackFallback({
  pack,
  client,
}: {
  pack: ReturnType<typeof useDiscoverableRoomPacks>[number]['pack'];
  client: MatrixClient;
}) {
  const first = pack.emoticons[0] ?? pack.stickers[0];
  if (first) return <EmoteImage client={client} mxc={first.mxc} alt={pack.displayName} size={28} />;
  return <span className="text-base text-[var(--color-text-muted)]">★</span>;
}
