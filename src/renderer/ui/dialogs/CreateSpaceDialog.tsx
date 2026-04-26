import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAccountsStore } from '@/state/accounts';
import { useUiStore } from '@/state/ui';
import { accountManager } from '@/matrix/AccountManager';
import { createSpace } from '@/matrix/roomOps';
import { Button } from '@/ui/primitives/button';
import { Input } from '@/ui/primitives/input';
import { DialogActions, DialogField, DialogShell } from './DialogShell';

export function CreateSpaceDialog() {
  const open = useUiStore((s) => s.createSpaceOpen);
  const setOpen = useUiStore((s) => s.setCreateSpaceOpen);
  const activeAccountId = useAccountsStore((s) => s.activeAccountId);
  const setActiveSpace = useAccountsStore((s) => s.setActiveSpace);

  const [name, setName] = useState('');
  const [topic, setTopic] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setName('');
      setTopic('');
      setIsPublic(false);
      setBusy(false);
    }
  }, [open]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !activeAccountId) return;
    const client = accountManager.getClient(activeAccountId);
    if (!client) return;
    setBusy(true);
    try {
      const roomId = await createSpace(client, {
        name: name.trim(),
        topic: topic.trim() || undefined,
        isPublic,
      });
      setActiveSpace(roomId);
      toast.success('Space created.');
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogShell
      open={open}
      onClose={() => setOpen(false)}
      title="Create space"
      description="Spaces group rooms together. You can add rooms after creating the space."
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <DialogField label="Name" htmlFor="create-space-name">
          <Input
            id="create-space-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My team"
            autoFocus
            disabled={busy}
          />
        </DialogField>
        <DialogField label="Description" htmlFor="create-space-topic" hint="Optional, shown to people you invite.">
          <Input
            id="create-space-topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="What is this space for?"
            disabled={busy}
          />
        </DialogField>
        <label className="flex cursor-pointer items-start justify-between gap-3 border border-[var(--color-divider)] bg-[var(--color-panel-2)] px-3 py-2.5">
          <span className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-[var(--color-text-strong)]">Public</span>
            <span className="text-xs text-[var(--color-text-muted)]">Anyone with the link can join.</span>
          </span>
          <input
            type="checkbox"
            checked={isPublic}
            onChange={(e) => setIsPublic(e.target.checked)}
            disabled={busy}
            className="mt-1 h-4 w-4 cursor-pointer accent-[var(--color-text-strong)] disabled:cursor-not-allowed disabled:opacity-50"
          />
        </label>
        <DialogActions>
          <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={!name.trim() || busy}>
            {busy ? 'Creating…' : 'Create space'}
          </Button>
        </DialogActions>
      </form>
    </DialogShell>
  );
}
