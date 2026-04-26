import { useEffect, useState } from 'react';
import type { MatrixClient, MatrixEvent, Room, RoomState } from 'matrix-js-sdk';
import { RoomStateEvent } from 'matrix-js-sdk';
import {
  Headphones,
  Loader2,
  Mic,
  MicOff,
  Monitor,
  Phone,
  PhoneOff,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { Button } from '@/ui/primitives/button';
import type { RoomSummary } from '@/state/rooms';
import { useAccountsStore } from '@/state/accounts';
import { useRtcStore } from '@/state/rtc';
import { useDeafenStore } from '@/state/voicePrefs';
import { accountManager } from '@/matrix/AccountManager';
import { AuthedImage } from '@/lib/mxc';
import { startCall } from '@/matrix/rtc/RtcSession';
import {
  leaveCall,
  toggleCamera,
  toggleDeafen,
  toggleMicrophone,
  toggleScreenShare,
} from '@/matrix/rtc/controls';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/primitives/tooltip';
import { CallTileGrid } from './TileGrid';
import { cn } from '@/lib/utils';

const CALL_MEMBER_STATE = 'org.matrix.msc3401.call.member';

interface VoiceMember {
  userId: string;
  name: string;
  avatarMxc: string | null;
}

function readMembers(room: Room): VoiceMember[] {
  const events = room.currentState.getStateEvents(CALL_MEMBER_STATE);
  const active: VoiceMember[] = [];
  for (const ev of events) {
    const content = ev.getContent() as { memberships?: unknown[] };
    if (!Array.isArray(content.memberships) || content.memberships.length === 0) continue;
    const userId = ev.getStateKey()?.split('_')[0] ?? ev.getSender();
    if (!userId) continue;
    const member = room.getMember(userId);
    active.push({
      userId,
      name: member?.name || userId,
      avatarMxc: member?.getMxcAvatarUrl() ?? null,
    });
  }
  const seen = new Set<string>();
  return active.filter((m) => (seen.has(m.userId) ? false : (seen.add(m.userId), true)));
}

export function VoiceChannelView({ room }: { room: RoomSummary }) {
  const activeAccountId = useAccountsStore((s) => s.activeAccountId);
  const client = activeAccountId ? accountManager.getClient(activeAccountId) : null;
  const activeCall = useRtcStore((s) => s.activeCall);
  const isConnectedHere = activeCall?.roomId === room.roomId;

  if (isConnectedHere) {
    return <ActiveCallView />;
  }
  return <VoiceLobby room={room} client={client} />;
}

function VoiceLobby({
  room,
  client,
}: {
  room: RoomSummary;
  client: MatrixClient | null | undefined;
}) {
  const activeAccountId = useAccountsStore((s) => s.activeAccountId);
  const activeCall = useRtcStore((s) => s.activeCall);
  const [members, setMembers] = useState<VoiceMember[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!client) return;
    const mxRoom = client.getRoom(room.roomId);
    if (!mxRoom) return;
    setMembers(readMembers(mxRoom));

    const onEvents = (_ev: MatrixEvent, state: RoomState) => {
      if (state.roomId !== mxRoom.roomId) return;
      setMembers(readMembers(mxRoom));
    };
    mxRoom.currentState.on(RoomStateEvent.Events, onEvents);
    return () => {
      mxRoom.currentState.off(RoomStateEvent.Events, onEvents);
    };
  }, [client, room.roomId]);

  async function onJoin() {
    if (!client || !activeAccountId) return;
    setBusy(true);
    setError(null);
    try {
      await startCall(client, activeAccountId, room.roomId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const isConnectedElsewhere = !!activeCall && activeCall.roomId !== room.roomId;

  return (
    <div className="flex flex-1 flex-col bg-[var(--color-panel-2)]">
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-10">
        <div className="flex h-16 w-16 items-center justify-center border border-[var(--color-divider)] bg-[var(--color-panel)] text-[var(--color-text-strong)]">
          <Headphones className="h-7 w-7" strokeWidth={1.5} />
        </div>
        <h2 className="mt-4 text-xl font-semibold tracking-tight text-[var(--color-text-strong)]">
          {room.name}
        </h2>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          {members.length === 0
            ? 'No one is connected yet.'
            : members.length === 1
              ? '1 person connected'
              : `${members.length} people connected`}
        </p>

        {members.length > 0 && (
          <ParticipantAvatars members={members} client={client} />
        )}

        <div className="mt-8 flex flex-col items-center gap-3">
          <Button
            onClick={onJoin}
            disabled={!client || busy || isConnectedElsewhere}
            size="lg"
            className="bg-emerald-500 px-6 text-white hover:bg-emerald-400 disabled:bg-emerald-500/40"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Phone className="h-4 w-4" />
            )}
            {busy ? 'Connecting…' : 'Join voice'}
          </Button>
          {isConnectedElsewhere && (
            <p className="text-xs text-[var(--color-text-muted)]">
              You’re already connected to another voice channel.
            </p>
          )}
          {error && (
            <p className="max-w-md text-center text-xs text-red-400">{error}</p>
          )}
        </div>

        {room.topic && (
          <p className="mt-8 max-w-lg text-center text-sm text-[var(--color-text-muted)]">
            {room.topic}
          </p>
        )}

        <div className="mt-10 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-faint)]">
          <Mic className="h-3 w-3" strokeWidth={1.75} />
          <span>Voice channel · End-to-end encrypted</span>
        </div>
      </div>
    </div>
  );
}

function ActiveCallView() {
  const call = useRtcStore((s) => s.activeCall);
  const participants = useRtcStore((s) => s.participants);
  const deafened = useDeafenStore((s) => s.deafened);

  if (!call) return null;

  return (
    <div className="flex flex-1 flex-col bg-[var(--color-bg)]">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[var(--color-divider)] bg-[var(--color-panel-2)] px-4">
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
          {call.connecting ? (
            <Loader2 className="h-3 w-3 animate-spin text-amber-400" />
          ) : (
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          )}
          <span>{call.connecting ? 'Connecting' : 'Connected'}</span>
          <span className="text-[var(--color-divider)]">·</span>
          <span className="text-[var(--color-text-strong)]">{call.roomName}</span>
        </div>
        <CallDuration startedAt={call.startedAt} />
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden p-4">
        <CallTileGrid />
      </div>

      <CallToolbar
        micMuted={call.micMuted}
        cameraOn={call.cameraOn}
        screenSharing={call.screenSharing}
        deafened={deafened}
        connecting={call.connecting}
        participantCount={participants.length}
      />
    </div>
  );
}

function CallToolbar({
  micMuted,
  cameraOn,
  screenSharing,
  deafened,
  connecting,
  participantCount,
}: {
  micMuted: boolean;
  cameraOn: boolean;
  screenSharing: boolean;
  deafened: boolean;
  connecting: boolean;
  participantCount: number;
}) {
  return (
    <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-[var(--color-divider)] bg-[var(--color-panel-2)] px-4 py-3">
      <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
        <span className="hidden md:inline">
          {participantCount === 1 ? '1 participant' : `${participantCount} participants`}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <ToolbarButton
          onClick={toggleMicrophone}
          state={micMuted ? 'muted' : 'on'}
          icon={micMuted ? MicOff : Mic}
          label={micMuted ? 'Unmute microphone' : 'Mute microphone'}
        />
        <ToolbarButton
          onClick={toggleDeafen}
          state={deafened ? 'muted' : 'on'}
          icon={deafened ? VolumeX : Volume2}
          label={deafened ? 'Undeafen' : 'Deafen'}
        />
        <ToolbarButton
          onClick={toggleCamera}
          state={cameraOn ? 'active' : 'off'}
          icon={cameraOn ? Video : VideoOff}
          label={cameraOn ? 'Stop video' : 'Start video'}
        />
        <ToolbarButton
          onClick={toggleScreenShare}
          state={screenSharing ? 'active' : 'off'}
          icon={Monitor}
          label={screenSharing ? 'Stop sharing screen' : 'Share screen'}
        />
        <div className="mx-1 h-6 w-px bg-[var(--color-divider)]" aria-hidden />
        <ToolbarButton
          onClick={leaveCall}
          state="danger"
          icon={PhoneOff}
          label="Disconnect"
          disabled={connecting}
        />
      </div>

      <div className="hidden w-[120px] md:block" aria-hidden />
    </footer>
  );
}

type ButtonState = 'on' | 'off' | 'active' | 'muted' | 'danger';

function ToolbarButton({
  onClick,
  state,
  icon: Icon,
  label,
  disabled,
}: {
  onClick: () => void;
  state: ButtonState;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  disabled?: boolean;
}) {
  const styles =
    state === 'danger'
      ? 'bg-red-500 text-white hover:bg-red-400'
      : state === 'muted'
        ? 'bg-red-500/15 text-red-400 hover:bg-red-500/25'
        : state === 'active'
          ? 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'
          : state === 'on'
            ? 'bg-[var(--color-surface)] text-[var(--color-text-strong)] hover:bg-[var(--color-hover-overlay)]'
            : 'bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:bg-[var(--color-hover-overlay)] hover:text-[var(--color-text-strong)]';
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            onClick={onClick}
            aria-label={label}
            disabled={disabled}
            className={cn('h-10 w-10 rounded-full p-0 transition-colors', styles)}
          />
        }
      >
        <Icon className="h-4 w-4" strokeWidth={1.75} />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function CallDuration({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  const h = Math.floor(seconds / 3600);
  const formatted = h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
  return (
    <span className="font-mono text-[10px] tabular-nums text-[var(--color-text-muted)]">
      {formatted}
    </span>
  );
}

function ParticipantAvatars({
  members,
  client,
}: {
  members: VoiceMember[];
  client: MatrixClient | null | undefined;
}) {
  const visible = members.slice(0, 12);
  const overflow = members.length - visible.length;
  return (
    <div className="mt-6 flex flex-wrap justify-center gap-4">
      {visible.map((m) => (
        <div key={m.userId} className="flex w-24 flex-col items-center gap-2">
          <AuthedImage
            client={client}
            mxc={m.avatarMxc}
            width={56}
            height={56}
            className="h-14 w-14 bg-[var(--color-surface)] object-cover ring-1 ring-emerald-500"
            fallback={
              <div className="flex h-14 w-14 items-center justify-center bg-[var(--color-surface)] text-lg font-semibold text-[var(--color-text-strong)] ring-1 ring-emerald-500">
                {m.name.replace(/^[@#]/, '').charAt(0).toUpperCase()}
              </div>
            }
          />
          <span className="max-w-full truncate text-xs text-[var(--color-text)]">
            {m.name}
          </span>
        </div>
      ))}
      {overflow > 0 && (
        <div className="flex w-24 flex-col items-center gap-2">
          <div className="flex h-14 w-14 items-center justify-center border border-[var(--color-divider)] bg-[var(--color-surface)] text-sm font-semibold text-[var(--color-text-muted)]">
            +{overflow}
          </div>
        </div>
      )}
    </div>
  );
}
