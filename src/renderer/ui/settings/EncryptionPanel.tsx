import { useState } from 'react';
import type { MatrixClient } from 'matrix-js-sdk';
import { toast } from 'sonner';
import { Button } from '@/ui/primitives/button';
import { Input } from '@/ui/primitives/input';
import { ensureCryptoBootstrapped, unlockWithRecoveryKey } from '@/matrix/verification';
import { SettingsPanel, SettingsSection } from './SettingsPrimitives';

export function EncryptionPanel({
  accountId,
  client,
}: {
  accountId: string | null;
  client: MatrixClient | null;
}) {
  const [bootstrapping, setBootstrapping] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState('');
  const [unlocking, setUnlocking] = useState(false);

  async function onBootstrap() {
    if (!client) return;
    setBootstrapping(true);
    try {
      await ensureCryptoBootstrapped(client);
      toast.success('Cross-signing set up.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBootstrapping(false);
    }
  }

  async function onUnlockRecovery() {
    if (!client || !accountId) return;
    setUnlocking(true);
    try {
      await unlockWithRecoveryKey(client, accountId, recoveryKey);
      setRecoveryKey('');
      toast.success('Unlocked. Restoring encrypted history from key backup…');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setUnlocking(false);
    }
  }

  return (
    <SettingsPanel title="Encryption">
      <SettingsSection label="Recovery key">
        <p className="text-xs text-[var(--color-text-muted)]">
          To decrypt messages sent before this device logged in, verify this device from another
          signed-in session, or enter your recovery key below.
        </p>
        <div className="flex flex-col gap-2 border border-[var(--color-divider)] bg-[var(--color-panel-2)] p-3">
          <label
            className="text-xs font-medium text-[var(--color-text-muted)]"
            htmlFor="recovery-key"
          >
            Recovery key
          </label>
          <Input
            id="recovery-key"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="EsT1 2AbC 3dEf …"
            value={recoveryKey}
            onChange={(e) => setRecoveryKey(e.target.value)}
            className="font-mono"
          />
          <div className="flex items-center gap-2">
            <Button
              type="button"
              onClick={onUnlockRecovery}
              disabled={unlocking || !recoveryKey.trim()}
            >
              {unlocking ? 'Unlocking…' : 'Unlock key backup'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={onBootstrap}
              disabled={bootstrapping}
              title="Only use this on a brand-new account with no existing backup"
            >
              {bootstrapping ? 'Setting up…' : 'First-time setup'}
            </Button>
          </div>
        </div>
      </SettingsSection>
    </SettingsPanel>
  );
}
