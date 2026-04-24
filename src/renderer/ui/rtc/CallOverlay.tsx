import { useRtcStore } from '@/state/rtc';
import { leaveCall, toggleCamera, toggleMicrophone, toggleScreenShare } from '@/matrix/rtc/controls';
import { Mic, MicOff, Monitor, PhoneOff, Video, VideoOff } from 'lucide-react';
import { TileGrid } from './TileGrid';

/**
 * Floating call window shown when a MatrixRTC session is active.
 * Full rendering logic is in M6.
 */
export function CallOverlay() {
  const call = useRtcStore((s) => s.activeCall);
  if (!call) return null;

  return (
    <div className="pointer-events-auto absolute inset-x-10 bottom-10 top-16 z-50 flex flex-col rounded-xl border border-[var(--color-divider)] bg-neutral-950/95 shadow-2xl">
      <header className="flex h-10 items-center border-b border-[var(--color-divider)] px-4 text-sm font-semibold">
        Call — {call.roomName}
      </header>
      <div className="relative flex-1 p-4">
        <TileGrid />
      </div>
      <footer className="flex items-center justify-center gap-3 border-t border-[var(--color-divider)] p-3">
        <CallButton onClick={toggleMicrophone} active={!call.micMuted} icon={call.micMuted ? MicOff : Mic} />
        <CallButton onClick={toggleCamera} active={call.cameraOn} icon={call.cameraOn ? Video : VideoOff} />
        <CallButton onClick={toggleScreenShare} active={call.screenSharing} icon={Monitor} />
        <CallButton onClick={leaveCall} active={false} icon={PhoneOff} variant="danger" />
      </footer>
    </div>
  );
}

function CallButton({
  onClick,
  active,
  icon: Icon,
  variant = 'default',
}: {
  onClick: () => void;
  active: boolean;
  icon: React.ComponentType<{ className?: string }>;
  variant?: 'default' | 'danger';
}) {
  const color =
    variant === 'danger'
      ? 'bg-red-600 hover:bg-red-500 text-white'
      : active
        ? 'bg-[var(--color-accent)] text-white'
        : 'bg-[var(--color-surface)] text-neutral-300 hover:bg-[var(--color-panel)]';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-10 w-10 items-center justify-center rounded-full ${color}`}
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}
