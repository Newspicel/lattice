import { useEffect, useRef, useState } from 'react';
import type { MatrixClient } from 'matrix-js-sdk';
import { Camera } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/ui/primitives/button';
import { Input } from '@/ui/primitives/input';
import { AuthedImage } from '@/lib/mxc';
import { useOwnProfile } from '@/lib/profile';
import { accountManager } from '@/matrix/AccountManager';
import { useAccountsStore } from '@/state/accounts';
import { SettingsPanel, SettingsRow, SettingsSection } from './SettingsPrimitives';

export function AccountPanel({
  accountId,
  client,
  onSignedOut,
}: {
  accountId: string;
  client: MatrixClient | null;
  onSignedOut: () => void;
}) {
  const account = useAccountsStore((s) => s.accounts[accountId]);
  const profile = useOwnProfile(client, account?.userId ?? '');
  const [displayName, setDisplayName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // Keep the editable field in sync with the resolved profile name
  // (homeserver may answer asynchronously after mount).
  useEffect(() => {
    setDisplayName(profile.displayName ?? '');
  }, [profile.displayName]);

  if (!account) return null;

  const currentName = profile.displayName ?? account.displayName ?? '';
  const nameDirty = displayName.trim() !== currentName.trim();
  const avatarMxc = profile.avatarMxc ?? account.avatarUrl ?? null;
  const fallbackInitial = (currentName || account.userId.replace(/^@/, '')).charAt(0).toUpperCase() || '?';

  async function onSaveName() {
    if (!client) return;
    setSavingName(true);
    try {
      await client.setDisplayName(displayName.trim());
      toast.success('Display name updated.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingName(false);
    }
  }

  async function onPickAvatar(file: File) {
    if (!client) return;
    setSavingAvatar(true);
    try {
      const upload = await client.uploadContent(file, { name: file.name, type: file.type });
      await client.setAvatarUrl(upload.content_uri);
      toast.success('Profile picture updated.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingAvatar(false);
    }
  }

  async function onClearAvatar() {
    if (!client) return;
    setSavingAvatar(true);
    try {
      await client.setAvatarUrl('');
      toast.success('Profile picture removed.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingAvatar(false);
    }
  }

  async function onSignOut() {
    setSigningOut(true);
    try {
      await accountManager.removeAccount(accountId);
      onSignedOut();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
      setSigningOut(false);
      setConfirmingSignOut(false);
    }
  }

  return (
    <SettingsPanel title="Account">
      <SettingsSection label="Profile">
        <div className="flex items-start gap-4 border border-[var(--color-divider)] bg-[var(--color-panel-2)] p-4">
          <div className="relative h-20 w-20 shrink-0 overflow-hidden bg-[var(--color-surface)]">
            <AuthedImage
              client={client}
              mxc={avatarMxc}
              width={80}
              height={80}
              className="h-full w-full object-cover"
              fallback={
                <span className="flex h-full w-full items-center justify-center text-2xl font-semibold uppercase text-[var(--color-text-strong)]">
                  {fallbackInitial}
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
              disabled={savingAvatar || !client}
              aria-label="Change profile picture"
              className="absolute inset-0 flex items-center justify-center bg-black/50 text-white opacity-0 transition-opacity hover:opacity-100 disabled:cursor-not-allowed"
            >
              <Camera className="h-5 w-5" strokeWidth={1.75} />
            </button>
          </div>
          <div className="flex flex-1 flex-col gap-2">
            <div className="text-xs uppercase tracking-wider text-[var(--color-text-muted)]">
              Profile picture
            </div>
            <p className="text-xs text-[var(--color-text-muted)]">
              Visible to anyone who shares a room with you. Hover the avatar to upload a new one.
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => fileInput.current?.click()}
                disabled={savingAvatar || !client}
              >
                {savingAvatar ? 'Uploading…' : 'Upload new'}
              </Button>
              {avatarMxc && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={onClearAvatar}
                  disabled={savingAvatar || !client}
                >
                  Remove
                </Button>
              )}
            </div>
          </div>
        </div>

        <SettingsRow label="Display name" hint="The name shown next to your messages.">
          <div className="flex w-full max-w-md gap-2">
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={account.userId.replace(/^@/, '').split(':')[0]}
              disabled={savingName || !client}
            />
            <Button
              type="button"
              size="sm"
              onClick={onSaveName}
              disabled={!nameDirty || savingName || !client}
            >
              {savingName ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection label="Identity">
        <SettingsRow label="User ID">
          <code className="font-mono text-xs text-[var(--color-text)]">{account.userId}</code>
        </SettingsRow>
        <SettingsRow label="Homeserver">
          <code className="font-mono text-xs text-[var(--color-text)]">{account.homeserverUrl}</code>
        </SettingsRow>
        <SettingsRow label="Device ID">
          <code className="font-mono text-xs text-[var(--color-text)]">{account.deviceId}</code>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection label="Sign out">
        <div className="flex flex-col gap-3 border border-red-900/50 bg-red-950/30 p-3">
          <div>
            <div className="text-sm font-medium text-[var(--color-text-strong)]">
              Sign out of {currentName || account.userId}
            </div>
            <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
              Invalidates this session on the server and removes local account data from this
              computer. You will need your recovery key (or another verified session) to read
              encrypted history when you sign back in.
            </p>
          </div>
          {confirmingSignOut ? (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                onClick={onSignOut}
                disabled={signingOut}
                className="bg-red-500 text-white hover:bg-red-400"
              >
                {signingOut ? 'Signing out…' : 'Confirm sign out'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setConfirmingSignOut(false)}
                disabled={signingOut}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              onClick={() => setConfirmingSignOut(true)}
              className="self-start bg-red-500/80 text-white hover:bg-red-500"
            >
              Sign out & remove account
            </Button>
          )}
        </div>
      </SettingsSection>
    </SettingsPanel>
  );
}
