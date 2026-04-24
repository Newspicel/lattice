import { useEffect, useRef } from 'react';
import { Track } from 'livekit-client';
import type { Participant, RemoteTrackPublication, TrackPublication } from 'livekit-client';
import { useRtcStore } from '@/state/rtc';
import { getActiveLivekitRoom } from '@/matrix/rtc/session-bridge';

export function TileGrid() {
  const participants = useRtcStore((s) => s.participants);
  return (
    <div className="grid h-full w-full grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
      {participants.map((p) => (
        <ParticipantTile key={p.identity} identity={p.identity} displayName={p.displayName} />
      ))}
    </div>
  );
}

function ParticipantTile({ identity, displayName }: { identity: string; displayName: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const lkRoom = getActiveLivekitRoom();
    if (!lkRoom) return;
    const isLocal = lkRoom.localParticipant.identity === identity;
    const participant: Participant | undefined = isLocal
      ? lkRoom.localParticipant
      : lkRoom.remoteParticipants.get(identity);
    if (!participant) return;

    const videoPubs = participant.getTrackPublications().filter(
      (p) => p.kind === Track.Kind.Video && p.track,
    );
    const videoPub: TrackPublication | undefined =
      videoPubs.find((p) => p.source === Track.Source.ScreenShare) ?? videoPubs[0];

    if (videoPub?.track && videoRef.current) {
      videoPub.track.attach(videoRef.current);
    }
    const audioPub = participant
      .getTrackPublications()
      .find((p) => p.kind === Track.Kind.Audio && p.track);
    if (audioPub?.track && !isLocal && audioRef.current) {
      audioPub.track.attach(audioRef.current);
    }
    // For remote participants we also want to actively subscribe.
    if (!isLocal) {
      for (const pub of participant.getTrackPublications() as RemoteTrackPublication[]) {
        pub.setSubscribed?.(true);
      }
    }
    return () => {
      if (videoPub?.track && videoRef.current) videoPub.track.detach(videoRef.current);
      if (audioPub?.track && audioRef.current) audioPub.track.detach(audioRef.current);
    };
  }, [identity]);

  return (
    <div className="relative flex items-center justify-center overflow-hidden rounded-lg bg-black">
      <video ref={videoRef} className="h-full w-full object-cover" autoPlay playsInline muted />
      <audio ref={audioRef} autoPlay />
      <span className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">
        {displayName}
      </span>
    </div>
  );
}
