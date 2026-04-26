import { useEffect, useMemo, useRef, useState } from 'react';
import { Track } from 'livekit-client';
import type {
  Participant,
  RemoteTrackPublication,
  TrackPublication,
} from 'livekit-client';
import { Mic, MicOff, Monitor, Pin, ScreenShare, Volume2 } from 'lucide-react';
import { useRtcStore, type ParticipantState } from '@/state/rtc';
import { useVoicePrefs, useDeafenStore, DEFAULT_DEVICE } from '@/state/voicePrefs';
import { getActiveLivekitRoom } from '@/matrix/rtc/session-bridge';
import { cn } from '@/lib/utils';

/**
 * Renders the active call's participants. Screen shares get a featured spot at
 * the top; remaining tiles fill a responsive grid below.
 */
export function CallTileGrid() {
  const participants = useRtcStore((s) => s.participants);
  const [pinned, setPinned] = useState<string | null>(null);

  const sharing = participants.filter((p) => p.screenSharing);
  // Auto-feature the most recent screen share. If the user pinned a tile, that
  // wins.
  const featuredId = pinned ?? sharing[0]?.identity ?? null;
  const featured = featuredId ? participants.find((p) => p.identity === featuredId) : null;

  // Drop the featured tile from the strip so it doesn't render twice.
  const others = useMemo(
    () => participants.filter((p) => p.identity !== featured?.identity),
    [participants, featured?.identity],
  );

  // Reset the pin if the pinned participant leaves.
  useEffect(() => {
    if (pinned && !participants.find((p) => p.identity === pinned)) {
      setPinned(null);
    }
  }, [pinned, participants]);

  if (participants.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-[var(--color-text-muted)]">
        Waiting for participants…
      </div>
    );
  }

  if (featured) {
    return (
      <div className="flex h-full w-full flex-col gap-3">
        <div className="flex-1 min-h-0">
          <ParticipantTile
            participant={featured}
            featured
            pinned={pinned === featured.identity}
            onTogglePin={() =>
              setPinned((cur) => (cur === featured.identity ? null : featured.identity))
            }
          />
        </div>
        {others.length > 0 && (
          <div className="flex h-28 shrink-0 gap-2 overflow-x-auto">
            {others.map((p) => (
              <div key={p.identity} className="aspect-video h-full shrink-0">
                <ParticipantTile
                  participant={p}
                  featured={false}
                  pinned={false}
                  onTogglePin={() => setPinned(p.identity)}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // No featured tile — auto-grid based on participant count.
  return (
    <div
      className={cn(
        'grid h-full w-full gap-3',
        gridClass(participants.length),
      )}
    >
      {participants.map((p) => (
        <ParticipantTile
          key={p.identity}
          participant={p}
          featured={false}
          pinned={false}
          onTogglePin={() => setPinned(p.identity)}
        />
      ))}
    </div>
  );
}

function gridClass(n: number): string {
  if (n <= 1) return 'grid-cols-1';
  if (n <= 4) return 'grid-cols-2 grid-rows-2';
  if (n <= 6) return 'grid-cols-3 grid-rows-2';
  if (n <= 9) return 'grid-cols-3 grid-rows-3';
  return 'grid-cols-4';
}

interface TileProps {
  participant: ParticipantState;
  featured: boolean;
  pinned: boolean;
  onTogglePin: () => void;
}

function ParticipantTile({ participant, featured, pinned, onTogglePin }: TileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const speakerDevice = useVoicePrefs((s) => s.speakerDeviceId);
  const outputVolume = useVoicePrefs((s) => s.outputVolume);
  const deafened = useDeafenStore((s) => s.deafened);

  // Attach LiveKit tracks. The screen-share publication wins over a camera
  // publication on the same participant.
  useEffect(() => {
    const lkRoom = getActiveLivekitRoom();
    if (!lkRoom) return;
    const isLocal = lkRoom.localParticipant.identity === participant.identity;
    const lkParticipant: Participant | undefined = isLocal
      ? lkRoom.localParticipant
      : lkRoom.remoteParticipants.get(participant.identity);
    if (!lkParticipant) return;

    const videoEl = videoRef.current;
    const audioEl = audioRef.current;

    const videoPubs = lkParticipant.getTrackPublications().filter(
      (pub) => pub.kind === Track.Kind.Video && pub.track,
    );
    const videoPub: TrackPublication | undefined =
      videoPubs.find((pub) => pub.source === Track.Source.ScreenShare) ?? videoPubs[0];

    if (videoPub?.track && videoEl) {
      videoPub.track.attach(videoEl);
    }

    const audioPub = lkParticipant
      .getTrackPublications()
      .find((pub) => pub.kind === Track.Kind.Audio && pub.track);
    if (audioPub?.track && !isLocal && audioEl) {
      audioPub.track.attach(audioEl);
    }

    if (!isLocal) {
      for (const pub of lkParticipant.getTrackPublications() as RemoteTrackPublication[]) {
        pub.setSubscribed?.(true);
      }
    }

    return () => {
      if (videoPub?.track && videoEl) videoPub.track.detach(videoEl);
      if (audioPub?.track && audioEl) audioPub.track.detach(audioEl);
    };
  }, [
    participant.identity,
    participant.screenSharing,
    participant.cameraOn,
    participant.micMuted,
  ]);

  // Apply selected output sink to remote audio elements.
  useEffect(() => {
    const el = audioRef.current;
    if (!el || participant.isLocal) return;
    if (speakerDevice === DEFAULT_DEVICE) return;
    const sinkable = el as HTMLAudioElement & {
      setSinkId?: (id: string) => Promise<void>;
    };
    if (!sinkable.setSinkId) return;
    sinkable.setSinkId(speakerDevice).catch(() => undefined);
  }, [speakerDevice, participant.isLocal, participant.identity]);

  // Apply output volume locally (lifecycle also calls setVolume on the
  // participant; this keeps the HTMLAudio element in sync as a safety net).
  useEffect(() => {
    const el = audioRef.current;
    if (!el || participant.isLocal) return;
    el.volume = deafened ? 0 : Math.min(1, Math.max(0, outputVolume));
  }, [outputVolume, deafened, participant.isLocal]);

  const hasVideo = participant.cameraOn || participant.screenSharing;
  const speakingRing =
    participant.isSpeaking && !participant.micMuted
      ? 'ring-2 ring-emerald-400 shadow-[0_0_0_2px_var(--color-bg)]'
      : 'ring-1 ring-[var(--color-divider)]';

  return (
    <div
      className={cn(
        'group relative h-full w-full overflow-hidden bg-black transition-shadow',
        speakingRing,
      )}
    >
      {hasVideo ? (
        <video
          ref={videoRef}
          className="h-full w-full object-contain"
          autoPlay
          playsInline
          muted
        />
      ) : (
        <AvatarFallback name={participant.displayName} featured={featured} />
      )}

      {/* Always render the audio element so it can be attached above. */}
      <audio ref={audioRef} autoPlay />

      {/* State badges — Discord layers icons in the top-left and bottom-left. */}
      <div className="pointer-events-none absolute left-2 top-2 flex items-center gap-1">
        {participant.screenSharing && (
          <BadgePill icon={ScreenShare} tone="emerald" label="Sharing screen" />
        )}
        {participant.isLocal && (
          <BadgePill icon={Pin} tone="surface" label="You" />
        )}
      </div>

      {/* Bottom strip: name + mic state. */}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/80 via-black/30 to-transparent px-2 py-1.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <span
            className={cn(
              'flex h-5 w-5 shrink-0 items-center justify-center',
              participant.micMuted
                ? 'text-red-400'
                : participant.isSpeaking
                  ? 'text-emerald-300'
                  : 'text-white/70',
            )}
            aria-hidden
          >
            {participant.micMuted ? (
              <MicOff className="h-3.5 w-3.5" strokeWidth={2} />
            ) : (
              <Mic className="h-3.5 w-3.5" strokeWidth={2} />
            )}
          </span>
          <span className="truncate text-xs text-white">{participant.displayName}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onTogglePin}
            aria-label={pinned ? 'Unpin' : 'Pin'}
            className="flex h-5 w-5 items-center justify-center text-white/40 opacity-0 transition-opacity hover:text-white group-hover:opacity-100"
          >
            <Pin className={cn('h-3 w-3', pinned && 'fill-white text-white')} strokeWidth={2} />
          </button>
          {participant.screenSharing && featured && (
            <Monitor className="h-3 w-3 text-emerald-300" strokeWidth={2} aria-hidden />
          )}
          {participant.isLocal && deafened && (
            <Volume2 className="h-3 w-3 text-red-400" strokeWidth={2} aria-hidden />
          )}
        </div>
      </div>
    </div>
  );
}

function AvatarFallback({ name, featured }: { name: string; featured: boolean }) {
  const initial = name.replace(/^[@#]/, '').charAt(0).toUpperCase() || '?';
  const sizing = featured ? 'h-32 w-32 text-5xl' : 'h-16 w-16 text-2xl';
  return (
    <div className="flex h-full w-full items-center justify-center bg-[var(--color-panel-2)]">
      <div
        className={cn(
          'flex items-center justify-center rounded-full bg-[var(--color-surface)] font-semibold text-[var(--color-text-strong)]',
          sizing,
        )}
      >
        {initial}
      </div>
    </div>
  );
}

function BadgePill({
  icon: Icon,
  tone,
  label,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  tone: 'emerald' | 'surface';
  label: string;
}) {
  const styles =
    tone === 'emerald'
      ? 'bg-emerald-500/90 text-white'
      : 'bg-black/60 text-white/80';
  return (
    <span
      className={cn(
        'flex h-5 items-center gap-1 px-1.5 text-[10px] font-medium uppercase tracking-wider',
        styles,
      )}
      title={label}
    >
      <Icon className="h-3 w-3" strokeWidth={2} />
    </span>
  );
}
