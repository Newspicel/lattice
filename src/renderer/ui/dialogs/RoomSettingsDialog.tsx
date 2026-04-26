import { useEffect, useRef, useState } from 'react';
import { Camera } from 'lucide-react';
import { toast } from 'sonner';
import type { MatrixClient } from 'matrix-js-sdk';
import { useAccountsStore } from '@/state/accounts';
import { useRoomsStore, type RoomSummary } from '@/state/rooms';
import { useUiStore } from '@/state/ui';
import { accountManager } from '@/matrix/AccountManager';
import {
  enableRoomEncryption,
  inviteToRoom,
  isValidUserId,
  leaveRoom,
  setRoomAvatar,
  setRoomName,
  setRoomTopic,
} from '@/matrix/roomOps';
import { AuthedImage } from '@/lib/mxc';
import { Button } from '@/ui/primitives/button';
import { Input } from '@/ui/primitives/input';
import { DialogShell } from './DialogShell';

export function RoomSettingsDialog() {
  const roomId = useUiStore((s) => s.roomSettingsForId);
  const setRoomId = useUiStore((s) => s.setRoomSettingsForId);
  const activeAccountId = useAccountsStore((s) => s.activeAccountId);
  const room = useRoomsStore((s) => {
    if (!activeAccountId || !roomId) return null;
    const list = s.byAccount[activeAccountId];
    return list?.find((r) => r.roomId === roomId) ?? null;
  });
  const client =
    (activeAccountId ? accountManager.getClient(activeAccountId) : null) ?? null;

  return (
    <DialogShell
      open={!!roomId}
      onClose={() => setRoomId(null)}
      title={room?.name ? `${room.name} — Settings` : 'Room settings'}
      width={560}
    >
      {room && client ? (
        <RoomSettingsBody
          room={room}
          client={client}
          onClose={() => setRoomId(null)}
        />
      ) : (
        <p className="text-sm text-[var(--color-text-muted)]">Room not available.</p>
      )}
    </DialogShell>
  );
}

function RoomSettingsBody({
  room,
  client,
  onClose,
}: {
  room: RoomSummary;
  client: MatrixClient;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <ProfileSection room={room} client={client} />
      <InviteSection room={room} client={client} />
      <EncryptionSection room={room} client={client} />
      <DangerSection room={room} client={client} onLeft={onClose} />
    </div>
  );
}

function ProfileSection({ room, client }: { room: RoomSummary; client: MatrixClient }) {
  const [name, setName] = useState(room.name);
  const [topic, setTopic] = useState(room.topic ?? '');
  const [savingName, setSavingName] = useState(false);
  const [savingTopic, setSavingTopic] = useState(false);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // Keep local state in sync with the live room summary so external changes
  // (other clients editing the room name) don't get clobbered by the form.
  useEffect(() => setName(room.name), [room.name]);
  useEffect(() => setTopic(room.topic ?? ''), [room.topic]);

  const nameDirty = name.trim() !== room.name.trim();
  const topicDirty = topic.trim() !== (room.topic ?? '').trim();

  async function onSaveName() {
    setSavingName(true);
    try {
      await setRoomName(client, room.roomId, name);
      toast.success('Room name updated.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingName(false);
    }
  }

  async function onSaveTopic() {
    setSavingTopic(true);
    try {
      await setRoomTopic(client, room.roomId, topic);
      toast.success('Topic updated.');
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
      await setRoomAvatar(client, room.roomId, upload.content_uri);
      toast.success('Room avatar updated.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingAvatar(false);
    }
  }

  async function onClearAvatar() {
    setSavingAvatar(true);
    try {
      await setRoomAvatar(client, room.roomId, null);
      toast.success('Room avatar removed.');
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
            mxc={room.avatarMxc}
            width={64}
            height={64}
            className="h-full w-full object-cover"
            fallback={
              <span className="flex h-full w-full items-center justify-center text-xl font-semibold uppercase text-[var(--color-text-strong)]">
                {(room.name.replace(/^[#@]/, '').charAt(0) || '?').toUpperCase()}
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
            aria-label="Change room avatar"
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
            {room.avatarMxc && (
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

      <Field label="Topic">
        <div className="flex gap-2">
          <Input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="What is this room about?"
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

function InviteSection({ room, client }: { room: RoomSummary; client: MatrixClient }) {
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
      await inviteToRoom(client, room.roomId, [id]);
      toast.success(`Invited ${id}.`);
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

function EncryptionSection({ room, client }: { room: RoomSummary; client: MatrixClient }) {
  const [busy, setBusy] = useState(false);

  if (room.isEncrypted) {
    return (
      <Section label="Encryption">
        <p className="border border-emerald-700/40 bg-emerald-900/10 px-3 py-2 text-xs text-[var(--color-text-muted)]">
          End-to-end encryption is enabled for this room. It can’t be turned off.
        </p>
      </Section>
    );
  }

  async function onEnable() {
    if (!confirm('Enable end-to-end encryption? This cannot be undone.')) return;
    setBusy(true);
    try {
      await enableRoomEncryption(client, room.roomId);
      toast.success('Encryption enabled.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section label="Encryption">
      <div className="flex flex-col gap-2 border border-[var(--color-divider)] bg-[var(--color-panel-2)] px-3 py-2.5">
        <p className="text-xs text-[var(--color-text-muted)]">
          Once enabled, messages can only be read by the people in the room. This change is permanent.
        </p>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={onEnable}
          disabled={busy}
          className="self-start"
        >
          {busy ? 'Enabling…' : 'Enable encryption'}
        </Button>
      </div>
    </Section>
  );
}

function DangerSection({
  room,
  client,
  onLeft,
}: {
  room: RoomSummary;
  client: MatrixClient;
  onLeft: () => void;
}) {
  const setActiveRoom = useAccountsStore((s) => s.setActiveRoom);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onLeave() {
    setBusy(true);
    try {
      await leaveRoom(client, room.roomId);
      setActiveRoom(null);
      toast.success(`Left ${room.name}.`);
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
          Leaving removes you from the room. You can re-join only if invited or if the room is public.
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
            Leave room
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
