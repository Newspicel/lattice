import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Hash, Trash2, Volume2 } from 'lucide-react';
import { toast } from 'sonner';
import type { MatrixClient } from 'matrix-js-sdk';
import { useAccountsStore } from '@/state/accounts';
import { useRoomsStore, type RoomSummary } from '@/state/rooms';
import { useUiStore } from '@/state/ui';
import { accountManager } from '@/matrix/AccountManager';
import {
  addRoomToSpace,
  inviteToRoom,
  isValidUserId,
  leaveRoom,
  removeRoomFromSpace,
  setRoomAvatar,
  setRoomName,
  setRoomTopic,
} from '@/matrix/roomOps';
import { AuthedImage } from '@/lib/mxc';
import { Button } from '@/ui/primitives/button';
import { Input } from '@/ui/primitives/input';
import { DialogShell } from './DialogShell';

export function SpaceSettingsDialog() {
  const spaceId = useUiStore((s) => s.spaceSettingsForId);
  const setSpaceId = useUiStore((s) => s.setSpaceSettingsForId);
  const activeAccountId = useAccountsStore((s) => s.activeAccountId);
  const space = useRoomsStore((s) => {
    if (!activeAccountId || !spaceId) return null;
    const list = s.byAccount[activeAccountId];
    return list?.find((r) => r.roomId === spaceId && r.isSpace) ?? null;
  });
  const client =
    (activeAccountId ? accountManager.getClient(activeAccountId) : null) ?? null;

  return (
    <DialogShell
      open={!!spaceId}
      onClose={() => setSpaceId(null)}
      title={space?.name ? `${space.name} — Space settings` : 'Space settings'}
      width={600}
    >
      {space && client ? (
        <SpaceSettingsBody
          space={space}
          client={client}
          onClose={() => setSpaceId(null)}
        />
      ) : (
        <p className="text-sm text-[var(--color-text-muted)]">Space not available.</p>
      )}
    </DialogShell>
  );
}

function SpaceSettingsBody({
  space,
  client,
  onClose,
}: {
  space: RoomSummary;
  client: MatrixClient;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col gap-5 max-h-[70vh] overflow-y-auto pr-1">
      <ProfileSection space={space} client={client} />
      <ChildRoomsSection space={space} client={client} />
      <InviteSection space={space} client={client} />
      <DangerSection space={space} client={client} onLeft={onClose} />
    </div>
  );
}

function ProfileSection({ space, client }: { space: RoomSummary; client: MatrixClient }) {
  const [name, setName] = useState(space.name);
  const [topic, setTopic] = useState(space.topic ?? '');
  const [savingName, setSavingName] = useState(false);
  const [savingTopic, setSavingTopic] = useState(false);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => setName(space.name), [space.name]);
  useEffect(() => setTopic(space.topic ?? ''), [space.topic]);

  const nameDirty = name.trim() !== space.name.trim();
  const topicDirty = topic.trim() !== (space.topic ?? '').trim();

  async function onSaveName() {
    setSavingName(true);
    try {
      await setRoomName(client, space.roomId, name);
      toast.success('Space name updated.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingName(false);
    }
  }

  async function onSaveTopic() {
    setSavingTopic(true);
    try {
      await setRoomTopic(client, space.roomId, topic);
      toast.success('Description updated.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingTopic(false);
    }
  }

  async function onPickAvatar(file: File) {
    setSavingAvatar(true);
    try {
      const upload = await client.uploadContent(file, { name: file.name, type: file.type });
      await setRoomAvatar(client, space.roomId, upload.content_uri);
      toast.success('Avatar updated.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingAvatar(false);
    }
  }

  async function onClearAvatar() {
    setSavingAvatar(true);
    try {
      await setRoomAvatar(client, space.roomId, null);
      toast.success('Avatar removed.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingAvatar(false);
    }
  }

  return (
    <Section label="Profile">
      <div className="flex items-start gap-4 border border-[var(--color-divider)] bg-[var(--color-panel-2)] p-3">
        <div className="relative h-16 w-16 shrink-0 overflow-hidden bg-[var(--color-surface)]">
          <AuthedImage
            client={client}
            mxc={space.avatarMxc}
            width={64}
            height={64}
            className="h-full w-full object-cover"
            fallback={
              <span className="flex h-full w-full items-center justify-center text-xl font-semibold uppercase text-[var(--color-text-strong)]">
                {(space.name.replace(/^[#@]/, '').charAt(0) || '?').toUpperCase()}
              </span>
            }
          />
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onPickAvatar(f);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={savingAvatar}
            aria-label="Change space avatar"
            className="absolute inset-0 flex items-center justify-center bg-black/50 text-white opacity-0 transition-opacity hover:opacity-100 disabled:cursor-not-allowed"
          >
            <Camera className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <div className="text-xs uppercase tracking-wider text-[var(--color-text-muted)]">
            Avatar
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => fileInput.current?.click()}
              disabled={savingAvatar}
            >
              {savingAvatar ? 'Uploading…' : 'Upload'}
            </Button>
            {space.avatarMxc && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={onClearAvatar}
                disabled={savingAvatar}
              >
                Remove
              </Button>
            )}
          </div>
        </div>
      </div>

      <Field label="Name">
        <div className="flex gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} disabled={savingName} />
          <Button onClick={onSaveName} disabled={!nameDirty || !name.trim() || savingName}>
            {savingName ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </Field>

      <Field label="Description">
        <div className="flex gap-2">
          <Input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="What is this space for?"
            disabled={savingTopic}
          />
          <Button onClick={onSaveTopic} disabled={!topicDirty || savingTopic}>
            {savingTopic ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </Field>
    </Section>
  );
}

function ChildRoomsSection({ space, client }: { space: RoomSummary; client: MatrixClient }) {
  const accountId = useAccountsStore((s) => s.activeAccountId);
  const allRooms = useRoomsStore((s) =>
    accountId ? s.byAccount[accountId] ?? [] : [],
  );

  const children = useMemo(() => {
    const ids = new Set(space.spaceChildIds);
    return allRooms.filter((r) => ids.has(r.roomId) && !r.isSpace);
  }, [allRooms, space.spaceChildIds]);
  const candidates = useMemo(() => {
    const ids = new Set(space.spaceChildIds);
    return allRooms.filter(
      (r) => !r.isSpace && !r.isDirect && !r.isInvite && !ids.has(r.roomId),
    );
  }, [allRooms, space.spaceChildIds]);

  const [adding, setAdding] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  async function onAdd(roomId: string) {
    setAdding(roomId);
    try {
      await addRoomToSpace(client, space.roomId, roomId);
      toast.success('Room added to space.');
      setPickerOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setAdding(null);
    }
  }

  async function onRemove(roomId: string) {
    setRemoving(roomId);
    try {
      await removeRoomFromSpace(client, space.roomId, roomId);
      toast.success('Room removed from space.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setRemoving(null);
    }
  }

  return (
    <Section label="Rooms in this space">
      {children.length === 0 ? (
        <p className="border border-[var(--color-divider)] bg-[var(--color-panel-2)] px-3 py-2 text-xs italic text-[var(--color-text-muted)]">
          No rooms yet. Add one below or create a new room.
        </p>
      ) : (
        <ul className="border border-[var(--color-divider)] bg-[var(--color-panel-2)]">
          {children.map((r) => {
            const Icon = r.isVoice ? Volume2 : Hash;
            return (
              <li
                key={r.roomId}
                className="flex items-center gap-2 border-b border-[var(--color-divider)] px-3 py-2 last:border-b-0"
              >
                <Icon className="h-4 w-4 shrink-0 text-[var(--color-text-faint)]" strokeWidth={1.75} />
                <span className="flex-1 truncate text-sm">{r.name}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onRemove(r.roomId)}
                  disabled={removing === r.roomId}
                  aria-label={`Remove ${r.name} from space`}
                  title="Remove from space"
                >
                  {removing === r.roomId ? '…' : <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {pickerOpen ? (
        <div className="border border-[var(--color-divider)] bg-[var(--color-panel-2)]">
          {candidates.length === 0 ? (
            <p className="px-3 py-2 text-xs italic text-[var(--color-text-muted)]">
              No other rooms to add.
            </p>
          ) : (
            <ul className="max-h-48 overflow-y-auto">
              {candidates.map((r) => {
                const Icon = r.isVoice ? Volume2 : Hash;
                return (
                  <li key={r.roomId}>
                    <button
                      type="button"
                      onClick={() => onAdd(r.roomId)}
                      disabled={adding !== null}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--color-hover-overlay-subtle)] disabled:opacity-50"
                    >
                      <Icon className="h-4 w-4 shrink-0 text-[var(--color-text-faint)]" strokeWidth={1.75} />
                      <span className="flex-1 truncate">{r.name}</span>
                      {adding === r.roomId && (
                        <span className="text-xs text-[var(--color-text-muted)]">Adding…</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="flex justify-end border-t border-[var(--color-divider)] px-2 py-1.5">
            <Button size="sm" variant="ghost" onClick={() => setPickerOpen(false)}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <Button
          size="sm"
          variant="secondary"
          className="self-start"
          onClick={() => setPickerOpen(true)}
        >
          Add existing room
        </Button>
      )}
    </Section>
  );
}

function InviteSection({ space, client }: { space: RoomSummary; client: MatrixClient }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);

  async function onInvite() {
    const id = value.trim();
    if (!isValidUserId(id)) {
      toast.error('Invalid Matrix user ID. Expected @user:server.tld.');
      return;
    }
    setBusy(true);
    try {
      await inviteToRoom(client, space.roomId, [id]);
      toast.success(`Invited ${id} to the space.`);
      setValue('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section label="Invite">
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="@alice:matrix.org"
          disabled={busy}
        />
        <Button onClick={onInvite} disabled={!value.trim() || busy}>
          {busy ? 'Inviting…' : 'Invite'}
        </Button>
      </div>
    </Section>
  );
}

function DangerSection({
  space,
  client,
  onLeft,
}: {
  space: RoomSummary;
  client: MatrixClient;
  onLeft: () => void;
}) {
  const setActiveSpace = useAccountsStore((s) => s.setActiveSpace);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onLeave() {
    setBusy(true);
    try {
      await leaveRoom(client, space.roomId);
      setActiveSpace(null);
      toast.success(`Left ${space.name}.`);
      onLeft();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <Section label="Leave">
      <div className="flex flex-col gap-3 border border-red-900/50 bg-red-950/30 p-3">
        <p className="text-xs text-[var(--color-text-muted)]">
          Leaving the space removes it from your sidebar. Rooms inside the space stay joined.
        </p>
        {confirming ? (
          <div className="flex items-center gap-2">
            <Button
              onClick={onLeave}
              disabled={busy}
              className="bg-red-500 text-white hover:bg-red-400"
            >
              {busy ? 'Leaving…' : 'Confirm leave'}
            </Button>
            <Button variant="secondary" onClick={() => setConfirming(false)} disabled={busy}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            onClick={() => setConfirming(true)}
            className="self-start bg-red-500/80 text-white hover:bg-red-500"
          >
            Leave space
          </Button>
        )}
      </div>
    </Section>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
        {label}
      </h3>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-[var(--color-text-muted)]">{label}</span>
      {children}
    </div>
  );
}
