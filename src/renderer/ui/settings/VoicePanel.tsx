import { useState } from 'react';
import { Camera, Mic, Volume2, AlertCircle } from 'lucide-react';
import { Button } from '@/ui/primitives/button';
import {
  useMediaDevices,
  requestMediaPermission,
  type DeviceOption,
} from '@/lib/devices';
import { useMicLevel } from '@/lib/audioLevel';
import { useCameraPreview } from '@/lib/cameraPreview';
import { useVoicePrefs, DEFAULT_DEVICE } from '@/state/voicePrefs';
import { SettingsPanel, SettingsRow, SettingsSection } from './SettingsPrimitives';
import { cn } from '@/lib/utils';

export function VoicePanel() {
  const prefs = useVoicePrefs();
  const devices = useMediaDevices();
  const [requesting, setRequesting] = useState(false);

  async function onGrantPermission() {
    setRequesting(true);
    await requestMediaPermission('both');
    setRequesting(false);
  }

  const showPermissionPrompt =
    !devices.permissionGranted &&
    (devices.audioinput.length === 0 ||
      !devices.audioinput.some((d) => !!d.label));

  return (
    <SettingsPanel title="Voice & Video">
      {showPermissionPrompt && (
        <div className="flex items-start gap-3 border border-[var(--color-divider)] bg-[var(--color-panel-2)] p-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-text-muted)]" />
          <div className="flex-1 text-xs text-[var(--color-text-muted)]">
            Grant microphone and camera access to choose specific devices and
            preview your input.
          </div>
          <Button onClick={onGrantPermission} size="sm" disabled={requesting}>
            {requesting ? 'Requesting…' : 'Grant access'}
          </Button>
        </div>
      )}

      <SettingsSection label="Input">
        <SettingsRow label="Microphone" hint="Used for outgoing audio in calls.">
          <DeviceSelect
            value={prefs.micDeviceId}
            onChange={prefs.setMicDevice}
            options={devices.audioinput}
            placeholder="System default"
          />
        </SettingsRow>
        <MicTester />
        <SettingsRow
          label="Input volume"
          hint="Multiplier applied locally to your microphone before transmission."
        >
          <VolumeSlider
            value={prefs.inputVolume}
            onChange={prefs.setInputVolume}
            ariaLabel="Input volume"
          />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection label="Output">
        <SettingsRow label="Speaker" hint="Where remote participants are played.">
          <DeviceSelect
            value={prefs.speakerDeviceId}
            onChange={prefs.setSpeakerDevice}
            options={devices.audiooutput}
            placeholder="System default"
          />
        </SettingsRow>
        <SettingsRow label="Output volume" hint="Master volume for incoming audio.">
          <VolumeSlider
            value={prefs.outputVolume}
            onChange={prefs.setOutputVolume}
            ariaLabel="Output volume"
          />
        </SettingsRow>
        <SpeakerTester deviceId={prefs.speakerDeviceId} />
      </SettingsSection>

      <SettingsSection label="Camera">
        <SettingsRow label="Camera" hint="Used when you turn on video in a call.">
          <DeviceSelect
            value={prefs.cameraDeviceId}
            onChange={prefs.setCameraDevice}
            options={devices.videoinput}
            placeholder="System default"
          />
        </SettingsRow>
        <CameraPreview deviceId={prefs.cameraDeviceId} />
      </SettingsSection>

      <SettingsSection label="Voice processing">
        <SettingsRow
          label="Echo cancellation"
          hint="Removes echo of remote audio captured back through your mic."
        >
          <ToggleSwitch
            checked={prefs.echoCancellation}
            onChange={prefs.setEchoCancellation}
            label="Echo cancellation"
          />
        </SettingsRow>
        <SettingsRow
          label="Noise suppression"
          hint="Reduces steady background noise like fans and keyboards."
        >
          <ToggleSwitch
            checked={prefs.noiseSuppression}
            onChange={prefs.setNoiseSuppression}
            label="Noise suppression"
          />
        </SettingsRow>
        <SettingsRow
          label="Auto gain control"
          hint="Automatically normalizes your microphone volume."
        >
          <ToggleSwitch
            checked={prefs.autoGainControl}
            onChange={prefs.setAutoGainControl}
            label="Auto gain control"
          />
        </SettingsRow>
      </SettingsSection>
    </SettingsPanel>
  );
}

function DeviceSelect({
  value,
  options,
  onChange,
  placeholder,
}: {
  value: string;
  options: DeviceOption[];
  onChange: (id: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative w-[260px]">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-full appearance-none border border-[var(--color-divider)] bg-[var(--color-panel)] pl-2.5 pr-7 text-xs text-[var(--color-text-strong)] outline-none transition-colors hover:border-[var(--color-text-faint)] focus-visible:border-[var(--color-text-faint)]"
      >
        <option value={DEFAULT_DEVICE}>{placeholder}</option>
        {options.map((d) => (
          <option key={d.deviceId} value={d.deviceId}>
            {d.label}
          </option>
        ))}
      </select>
      <span
        aria-hidden
        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[var(--color-text-muted)]"
      >
        ▼
      </span>
    </div>
  );
}

function MicTester() {
  const prefs = useVoicePrefs();
  const { level, error } = useMicLevel({
    enabled: true,
    deviceId: prefs.micDeviceId,
    noiseSuppression: prefs.noiseSuppression,
    echoCancellation: prefs.echoCancellation,
    autoGainControl: prefs.autoGainControl,
  });
  return (
    <div className="flex flex-col gap-2 border border-[var(--color-divider)] bg-[var(--color-panel-2)] px-3 py-2.5">
      <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
        <Mic className="h-3.5 w-3.5" strokeWidth={1.75} />
        <span>{error ? error : 'Speak to test your microphone'}</span>
      </div>
      <LevelBar level={level} />
    </div>
  );
}

function LevelBar({ level }: { level: number }) {
  const segments = 24;
  const lit = Math.round(level * segments);
  return (
    <div
      className="flex h-2.5 gap-px"
      aria-hidden
      role="meter"
      aria-valuemin={0}
      aria-valuemax={1}
      aria-valuenow={level}
    >
      {Array.from({ length: segments }).map((_, i) => {
        const filled = i < lit;
        const tone =
          i < segments * 0.6
            ? 'bg-emerald-500'
            : i < segments * 0.85
              ? 'bg-amber-400'
              : 'bg-red-500';
        return (
          <div
            key={i}
            className={cn(
              'flex-1 transition-colors',
              filled ? tone : 'bg-[var(--color-surface)]',
            )}
          />
        );
      })}
    </div>
  );
}

function SpeakerTester({ deviceId }: { deviceId: string }) {
  const [playing, setPlaying] = useState(false);

  async function play() {
    setPlaying(true);
    try {
      await playTestTone(deviceId);
    } finally {
      setPlaying(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 border border-[var(--color-divider)] bg-[var(--color-panel-2)] px-3 py-2.5">
      <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
        <Volume2 className="h-3.5 w-3.5" strokeWidth={1.75} />
        <span>Play a short tone on the selected output.</span>
      </div>
      <Button size="sm" variant="secondary" onClick={play} disabled={playing}>
        {playing ? 'Playing…' : 'Test'}
      </Button>
    </div>
  );
}

/**
 * Plays a short sine on the requested output device. We can't aim a Web Audio
 * graph at a sinkId directly, so we create a MediaStreamDestination and route
 * it through an <audio> element with setSinkId.
 */
async function playTestTone(deviceId: string): Promise<void> {
  let ctx: AudioContext | null = null;
  let audio: HTMLAudioElement | null = null;
  try {
    ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 440;
    gain.gain.value = 0.0001;

    if (deviceId !== DEFAULT_DEVICE && typeof HTMLAudioElement !== 'undefined') {
      const dest = ctx.createMediaStreamDestination();
      osc.connect(gain).connect(dest);
      audio = new Audio();
      audio.srcObject = dest.stream;
      const sinkable = audio as HTMLAudioElement & {
        setSinkId?: (id: string) => Promise<void>;
      };
      if (sinkable.setSinkId) {
        try { await sinkable.setSinkId(deviceId); } catch { /* fall back to default */ }
      }
      await audio.play().catch(() => undefined);
    } else {
      osc.connect(gain).connect(ctx.destination);
    }

    osc.start();
    const now = ctx.currentTime;
    gain.gain.exponentialRampToValueAtTime(0.2, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
    await new Promise((r) => setTimeout(r, 700));
    osc.stop();
  } catch {
    /* noop */
  } finally {
    if (audio) {
      audio.pause();
      audio.srcObject = null;
    }
    if (ctx) await ctx.close().catch(() => undefined);
  }
}

function CameraPreview({ deviceId }: { deviceId: string }) {
  const { videoRef, error } = useCameraPreview(deviceId, true);
  return (
    <div className="flex flex-col gap-2 border border-[var(--color-divider)] bg-[var(--color-panel-2)] p-3">
      <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
        <Camera className="h-3.5 w-3.5" strokeWidth={1.75} />
        <span>{error ? error : 'Live preview of the selected camera.'}</span>
      </div>
      <div className="relative aspect-video w-full overflow-hidden bg-black">
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          autoPlay
          playsInline
          muted
        />
      </div>
    </div>
  );
}

function VolumeSlider({
  value,
  onChange,
  ariaLabel,
}: {
  value: number;
  onChange: (v: number) => void;
  ariaLabel: string;
}) {
  return (
    <div className="flex w-[260px] items-center gap-3">
      <input
        type="range"
        min={0}
        max={2}
        step={0.05}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        aria-label={ariaLabel}
        className="flex-1 accent-[var(--color-accent)]"
      />
      <span className="w-10 text-right text-xs tabular-nums text-[var(--color-text-muted)]">
        {Math.round(value * 100)}%
      </span>
    </div>
  );
}

function ToggleSwitch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 items-center border transition-colors',
        checked
          ? 'border-emerald-500 bg-emerald-500/30'
          : 'border-[var(--color-divider)] bg-[var(--color-panel)]',
      )}
    >
      <span
        className={cn(
          'block h-3 w-3 transition-all',
          checked
            ? 'translate-x-5 bg-emerald-400'
            : 'translate-x-1 bg-[var(--color-text-muted)]',
        )}
      />
    </button>
  );
}
