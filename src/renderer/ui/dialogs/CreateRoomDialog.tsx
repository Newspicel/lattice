import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useAccountsStore } from '@/state/accounts';
import { useUiStore } from '@/state/ui';
import { useRoomsStore } from '@/state/rooms';
import { accountManager } from '@/matrix/AccountManager';
import { createGroupRoom } from '@/matrix/roomOps';
import { Button } from '@/ui/primitives/button';
import { Input } from '@/ui/primitives/input';
import { DialogActions, DialogField, DialogShell } from './DialogShell';

export function CreateRoomDialog() {
  const target = useUiStore((s) => s.createRoomOpen);
  const setOpen = useUiStore((s) => s.setCreateRoomOpen);
  const activeAccountId = useAccountsStore((s) => s.activeAccountId);
  const setActiveRoom = useAccountsStore((s) => s.setActiveRoom);
  const setActiveSpace = useAccountsStore((s) => s.setActiveSpace);
  const allRooms = useRoomsStore((s) =>
    activeAccountId ? s.byAccount[activeAccountId] ?? [] : [],
  );

  const spaces = useMemo(() => allRooms.filter((r) => r.isSpace), [allRooms]);

  const [name, setName] = useState('');
  const [topic, setTopic] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [encrypted, setEncrypted] = useState(true);
  const [parentSpaceId, setParentSpaceId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // When the dialog opens, hydrate the parent space dropdown from the
  // trigger's hint (e.g., the "+" inside a space view defaults to that space).
  useEffect(() => {
    if (target) {
      setParentSpaceId(target.parentSpaceId);
    } else {
      setName('');
      setTopic('');
      setIsPublic(false);
      setEncrypted(true);
      setParentSpaceId(null);
    }
  }, [target]);

  // Public rooms can't run E2EE — toggle encryption off and lock it.
  useEffect(() => {
    if (isPublic) setEncrypted(false);
  }, [isPublic]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !activeAccountId) return;
    const client = accountManager.getClient(activeAccountId);
    if (!client) return;
    setBusy(true);
    try {
      const roomId = await createGroupRoom(client, {
        name: name.trim(),
        topic: topic.trim() || undefined,
        isPublic,
        encrypted,
        parentSpaceId: parentSpaceId || null,
      });
      if (parentSpaceId) {
        setActiveSpace(parentSpaceId);
      } else {
        setActiveSpace(null);
      }
      setActiveRoom(roomId);
      toast.success('Room created.');
      setOpen(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogShell
      open={target !== null}
      onClose={() => setOpen(null)}
      title="Create room"
      description="Create a group chat. Encrypted rooms can’t be made public after creation."
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <DialogField label="Name" htmlFor="create-room-name">
          <Input
            id="create-room-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="general"
            autoFocus
            disabled={busy}
          />
        </DialogField>
        <DialogField label="Topic" htmlFor="create-room-topic" hint="Optional, shown under the room title.">
          <Input
            id="create-room-topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="What is this room about?"
            disabled={busy}
          />
        </DialogField>
        {spaces.length > 0 && (
          <DialogField label="Parent space" htmlFor="create-room-space" hint="Adds the room as a child of the selected space.">
            <select
              id="create-room-space"
              value={parentSpaceId ?? ''}
              onChange={(e) => setParentSpaceId(e.target.value || null)}
              disabled={busy}
              className="h-9 w-full border border-[var(--color-divider)] bg-[var(--color-panel-2)] px-2 text-sm outline-none focus:border-[var(--color-text-faint)]"
            >
              <option value="">— None (orphan room) —</option>
              {spaces.map((s) => (
                <option key={s.roomId} value={s.roomId}>
                  {s.name}
                </option>
              ))}
            </select>
          </DialogField>
        )}
        <Toggle
          label="Public"
          hint="Anyone who knows the room link can join. Disables encryption."
          checked={isPublic}
          onChange={setIsPublic}
          disabled={busy}
        />
        <Toggle
          label="End-to-end encryption"
          hint="Once enabled, encryption can’t be turned off."
          checked={encrypted}
          onChange={setEncrypted}
          disabled={busy || isPublic}
        />
        <DialogActions>
          <Button type="button" variant="secondary" onClick={() => setOpen(null)} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={!name.trim() || busy}>
            {busy ? 'Creating…' : 'Create room'}
          </Button>
        </DialogActions>
      </form>
    </DialogShell>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3 border border-[var(--color-divider)] bg-[var(--color-panel-2)] px-3 py-2.5">
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-[var(--color-text-strong)]">{label}</span>
        {hint && <span className="text-xs text-[var(--color-text-muted)]">{hint}</span>}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="mt-1 h-4 w-4 cursor-pointer accent-[var(--color-text-strong)] disabled:cursor-not-allowed disabled:opacity-50"
      />
    </label>
  );
}
