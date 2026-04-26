import { Mic, MicOff, Monitor, PhoneOff, Video, VideoOff, Volume2, VolumeX } from 'lucide-react';
import { useRtcStore } from '@/state/rtc';
import { useAccountsStore } from '@/state/accounts';
import { useDeafenStore } from '@/state/voicePrefs';
import {
  leaveCall,
  toggleCamera,
  toggleDeafen,
  toggleMicrophone,
  toggleScreenShare,
} from '@/matrix/rtc/controls';
import { Button } from '@/ui/primitives/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/primitives/tooltip';
import { cn } from '@/lib/utils';

/**
 * Floating "now playing" style bar shown when the user is connected to a call
 * but viewing a different room. Clicking the title jumps back to the call's
 * room.
 */
export function CallOverlay() {
  const call = useRtcStore((s) => s.activeCall);
  const participants = useRtcStore((s) => s.participants);
  const activeRoomId = useAccountsStore((s) => s.activeRoomId);
  const activeAccountId = useAccountsStore((s) => s.activeAccountId);
  const setActiveAccount = useAccountsStore((s) => s.setActiveAccount);
  const setActiveRoom = useAccountsStore((s) => s.setActiveRoom);
  const deafened = useDeafenStore((s) => s.deafened);

  if (!call) return null;
  // While the user is viewing the call's own room, the in-room view owns the
  // controls; suppress the floating bar to avoid duplicate UIs.
  if (call.roomId === activeRoomId && call.accountId === activeAccountId) return null;

  const speakers = participants.filter((p) => p.isSpeaking && !p.micMuted);

  function jumpToCall() {
    setActiveAccount(call!.accountId);
    setActiveRoom(call!.roomId);
  }

  return (
    <div className="pointer-events-none absolute bottom-3 left-1/2 z-40 -translate-x-1/2">
      <div className="pointer-events-auto flex items-center gap-3 border border-[var(--color-divider)] bg-[var(--color-panel)] px-3 py-2 shadow-lg">
        <button
          type="button"
          onClick={jumpToCall}
          className="flex min-w-0 items-center gap-2 text-left"
          title="Open call"
        >
          <span
            className={cn(
              'h-2 w-2 shrink-0 rounded-full',
              call.connecting ? 'bg-amber-400' : 'bg-emerald-500',
            )}
            aria-hidden
          />
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-xs font-semibold text-[var(--color-text-strong)]">
              {call.roomName}
            </span>
            <span className="truncate text-[10px] text-[var(--color-text-muted)]">
              {call.connecting
                ? 'Connecting…'
                : speakers.length > 0
                  ? `${speakers[0].displayName}${speakers.length > 1 ? ` +${speakers.length - 1}` : ''} speaking`
                  : `${participants.length} ${participants.length === 1 ? 'person' : 'people'}`}
            </span>
          </div>
        </button>

        <span className="h-6 w-px bg-[var(--color-divider)]" aria-hidden />

        <div className="flex items-center gap-1">
          <MiniButton
            onClick={toggleMicrophone}
            active={!call.micMuted}
            danger={call.micMuted}
            icon={call.micMuted ? MicOff : Mic}
            label={call.micMuted ? 'Unmute' : 'Mute'}
          />
          <MiniButton
            onClick={toggleDeafen}
            active={!deafened}
            danger={deafened}
            icon={deafened ? VolumeX : Volume2}
            label={deafened ? 'Undeafen' : 'Deafen'}
          />
          <MiniButton
            onClick={toggleCamera}
            active={call.cameraOn}
            icon={call.cameraOn ? Video : VideoOff}
            label={call.cameraOn ? 'Stop video' : 'Start video'}
          />
          <MiniButton
            onClick={toggleScreenShare}
            active={call.screenSharing}
            icon={Monitor}
            label={call.screenSharing ? 'Stop sharing' : 'Share screen'}
          />
          <MiniButton
            onClick={leaveCall}
            active={false}
            icon={PhoneOff}
            label="Disconnect"
            variant="danger"
          />
        </div>
      </div>
    </div>
  );
}

function MiniButton({
  onClick,
  active,
  danger,
  icon: Icon,
  label,
  variant = 'default',
}: {
  onClick: () => void;
  active: boolean;
  danger?: boolean;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  variant?: 'default' | 'danger';
}) {
  const styles =
    variant === 'danger'
      ? 'bg-red-500 text-white hover:bg-red-400'
      : danger
        ? 'bg-red-500/15 text-red-400 hover:bg-red-500/25'
        : active
          ? 'bg-[var(--color-surface)] text-[var(--color-text-strong)] hover:bg-[var(--color-hover-overlay)]'
          : 'text-[var(--color-text-muted)] hover:bg-[var(--color-hover-overlay)] hover:text-[var(--color-text-strong)]';
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            onClick={onClick}
            aria-label={label}
            className={cn('h-7 w-7 rounded-full p-0', styles)}
          />
        }
      >
        <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
