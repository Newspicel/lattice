import { useEffect, useState } from 'react';
import { Download, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/ui/primitives/button';
import { cn } from '@/lib/utils';
import type { UpdateChannel, UpdateState } from '@shared/types';
import { SettingsPanel, SettingsRow, SettingsSection } from './SettingsPrimitives';

const CHANNEL_OPTIONS: ReadonlyArray<{
  value: UpdateChannel;
  label: string;
  hint: string;
}> = [
  { value: 'stable', label: 'Stable', hint: 'Tested releases.' },
  { value: 'nightly', label: 'Nightly', hint: 'Daily builds — may be unstable.' },
];

export function UpdatesPanel() {
  const [channel, setChannel] = useState<UpdateChannel>('stable');
  const [state, setState] = useState<UpdateState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([window.native.updates.getChannel(), window.native.updates.getState()]).then(
      ([c, s]) => {
        if (cancelled) return;
        setChannel(c);
        setState(s);
      },
    );
    const off = window.native.updates.onStateChanged((s) => setState(s));
    return () => {
      cancelled = true;
      off();
    };
  }, []);

  async function changeChannel(next: UpdateChannel) {
    if (next === channel) return;
    setBusy(true);
    try {
      const result = await window.native.updates.setChannel(next);
      setChannel(result);
    } finally {
      setBusy(false);
    }
  }

  async function checkNow() {
    setBusy(true);
    try {
      await window.native.updates.check();
    } finally {
      setBusy(false);
    }
  }

  return (
    <SettingsPanel title="Updates">
      <SettingsSection label="Channel">
        <SettingsRow
          label="Update channel"
          hint="Switch between tested stable releases and the latest nightly build from CI."
        >
          <ChannelPicker channel={channel} disabled={busy} onChange={changeChannel} />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection label="Status">
        <SettingsRow label="Current version" hint="Lattice version installed on this device.">
          <code className="font-mono text-xs text-[var(--color-text-muted)]">
            {state?.version ?? '…'}
          </code>
        </SettingsRow>

        <SettingsRow label={availableLabel(state)} hint={statusHint(state)}>
          <UpdateAction
            state={state}
            busy={busy}
            onCheck={checkNow}
            onInstall={() => void window.native.updates.quitAndInstall()}
          />
        </SettingsRow>
      </SettingsSection>
    </SettingsPanel>
  );
}

function ChannelPicker({
  channel,
  disabled,
  onChange,
}: {
  channel: UpdateChannel;
  disabled: boolean;
  onChange: (value: UpdateChannel) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Update channel"
      className="inline-flex border border-[var(--color-divider)] bg-[var(--color-panel)]"
    >
      {CHANNEL_OPTIONS.map((option) => {
        const active = channel === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            title={option.hint}
            className={cn(
              'flex h-8 items-center px-3 text-xs font-medium transition-colors disabled:opacity-60',
              active
                ? 'bg-[var(--color-surface)] text-[var(--color-text-strong)]'
                : 'text-[var(--color-text-muted)] hover:bg-[var(--color-hover-overlay)] hover:text-[var(--color-text-strong)]',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function availableLabel(state: UpdateState | null): string {
  if (!state) return 'Available update';
  switch (state.status) {
    case 'downloaded':
      return 'Update ready';
    case 'downloading':
      return 'Downloading update';
    case 'available':
      return 'Update found';
    default:
      return 'Available update';
  }
}

function statusHint(state: UpdateState | null): string {
  if (!state) return 'Loading…';
  switch (state.status) {
    case 'idle':
      return 'Click "Check now" to look for new builds.';
    case 'checking':
      return 'Checking for updates…';
    case 'available':
      return state.availableVersion
        ? `Found ${state.availableVersion} — downloading in the background.`
        : 'A new build is downloading in the background.';
    case 'downloading': {
      const pct = Math.round(state.progress?.percent ?? 0);
      return state.availableVersion
        ? `Downloading ${state.availableVersion} — ${pct}%`
        : `Downloading — ${pct}%`;
    }
    case 'downloaded':
      return state.availableVersion
        ? `${state.availableVersion} is ready. Restart to install.`
        : 'A new build is ready. Restart to install.';
    case 'up-to-date':
      return 'You are on the latest build for this channel.';
    case 'error':
      return state.error ?? 'Update check failed.';
    case 'unsupported':
      return state.error ?? 'Updates are only delivered in packaged builds.';
    default:
      return '';
  }
}

function UpdateAction({
  state,
  busy,
  onCheck,
  onInstall,
}: {
  state: UpdateState | null;
  busy: boolean;
  onCheck: () => void;
  onInstall: () => void;
}) {
  const status = state?.status ?? 'idle';

  if (status === 'downloaded') {
    return (
      <Button onClick={onInstall} variant="default">
        <Download className="h-3.5 w-3.5" />
        Restart and install
      </Button>
    );
  }
  if (status === 'downloading' || status === 'checking') {
    return (
      <Button disabled variant="secondary">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Working…
      </Button>
    );
  }
  return (
    <Button
      onClick={onCheck}
      disabled={busy || status === 'unsupported'}
      variant="secondary"
    >
      <RefreshCw className="h-3.5 w-3.5" />
      Check now
    </Button>
  );
}
