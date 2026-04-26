import { useState } from 'react';
import { toast } from 'sonner';
import { useAccountsStore } from '@/state/accounts';
import { useUiStore } from '@/state/ui';
import { accountManager } from '@/matrix/AccountManager';
import { createOrOpenDirectMessage, isValidUserId } from '@/matrix/roomOps';
import { Button } from '@/ui/primitives/button';
import { Input } from '@/ui/primitives/input';
import { DialogActions, DialogField, DialogShell } from './DialogShell';

export function StartDmDialog() {
  const open = useUiStore((s) => s.startDmOpen);
  const setOpen = useUiStore((s) => s.setStartDmOpen);
  const activeAccountId = useAccountsStore((s) => s.activeAccountId);
  const setActiveRoom = useAccountsStore((s) => s.setActiveRoom);
  const setActiveSpace = useAccountsStore((s) => s.setActiveSpace);
  const [userId, setUserId] = useState('');
  const [busy, setBusy] = useState(false);

  function reset() {
    setUserId('');
    setBusy(false);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!activeAccountId) return;
    const client = accountManager.getClient(activeAccountId);
    if (!client) return;
    setBusy(true);
    try {
      const roomId = await createOrOpenDirectMessage(client, userId);
      setActiveSpace(null);
      setActiveRoom(roomId);
      toast.success('Direct message ready.');
      setOpen(false);
      reset();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const valid = isValidUserId(userId.trim());

  return (
    <DialogShell
      open={open}
      onClose={() => {
        setOpen(false);
        reset();
      }}
      title="Start direct message"
      description="Send a chat invite to another Matrix user."
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <DialogField
          label="User ID"
          hint="Format: @user:server.tld"
          htmlFor="start-dm-user"
        >
          <Input
            id="start-dm-user"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="@alice:matrix.org"
            autoFocus
            disabled={busy}
          />
        </DialogField>
        <DialogActions>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setOpen(false);
              reset();
            }}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={!valid || busy}>
            {busy ? 'Starting…' : 'Start chat'}
          </Button>
        </DialogActions>
      </form>
    </DialogShell>
  );
}
