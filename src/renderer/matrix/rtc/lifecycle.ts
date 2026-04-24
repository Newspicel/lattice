// MatrixRTC call lifecycle — implemented in M6.
//
// Flow:
//   1. Discover `rtc_foci` from homeserver's .well-known.
//   2. Open a MatrixRTCSession from client.matrixRTC.
//   3. session.joinRoomSession(foci, ...) with unstable sticky events + LiveKit key distribution.
//   4. Exchange the client's OpenID token for a LiveKit JWT via lk-jwt-service.
//   5. Connect a livekit-client Room with E2EE enabled, feeding Matrix-distributed
//      per-participant keys into a MatrixKeyProvider that wires into LiveKit's insertable streams.
//   6. Subscribe participant + track events to drive the Zustand rtc store.

import type { MatrixClient } from 'matrix-js-sdk';
import { RoomEvent as LivekitRoomEvent, Room as LivekitRoomClass, Track } from 'livekit-client';
import type { Room as LivekitRoom, RemoteParticipant, LocalParticipant } from 'livekit-client';
import type { MatrixRTCSession } from 'matrix-js-sdk/lib/matrixrtc/MatrixRTCSession';
import { MatrixRTCSessionEvent } from 'matrix-js-sdk/lib/matrixrtc/MatrixRTCSession';
import type { LivekitFocus } from './discovery';
import { discoverRtcFoci } from './discovery';
import { getLivekitToken } from './livekit';
import { MatrixKeyProvider, bridgeMatrixKeysIntoLivekit } from './encryption';
import { setActiveLivekitRoom } from './session-bridge';
import { useRtcStore } from '@/state/rtc';

interface ActiveSession {
  client: MatrixClient;
  accountId: string;
  roomId: string;
  session: MatrixRTCSession;
  lkRoom: LivekitRoom;
  keyProvider: MatrixKeyProvider;
  teardownMatrix: () => void;
  teardownLk: () => void;
}

let active: ActiveSession | null = null;

export async function joinCallInternal(
  client: MatrixClient,
  accountId: string,
  roomId: string,
): Promise<void> {
  if (active) await leaveActiveCall();

  const room = client.getRoom(roomId);
  if (!room) throw new Error(`Unknown room ${roomId}`);

  const homeserverUrl = client.getHomeserverUrl();
  const foci = await discoverRtcFoci(homeserverUrl);
  if (foci.length === 0) {
    throw new Error('This homeserver has no MatrixRTC backend configured.');
  }
  const focus = foci[0];

  // Acquire a MatrixRTCSession and install E2EE bridge before joining.
  const session = client.matrixRTC.getRoomSession(room);
  const keyProvider = new MatrixKeyProvider();

  // Obtain a LiveKit JWT and prepare the LiveKit Room (connect after join).
  const token = await getLivekitToken(client, focus, roomId);
  const lkRoom = new LivekitRoomClass({
    adaptiveStream: true,
    dynacast: true,
    e2ee: {
      keyProvider,
      worker: new Worker(new URL('livekit-client/e2ee-worker', import.meta.url), {
        type: 'module',
      }),
    },
  });

  const teardownMatrix = bridgeMatrixKeysIntoLivekit(session, lkRoom, keyProvider);
  const teardownLk = wireLivekitEvents(lkRoom);

  // Join the Matrix session (m.rtc.member + key distribution over to-device).
  const transport: LivekitFocus = focus;
  // joinRoomSession returns void synchronously — the actual join is async.
  session.joinRoomSession([transport], undefined, {
    unstableSendStickyEvents: true,
  });
  await waitForJoin(session);

  // Connect to the SFU.
  await lkRoom.connect(token.url, token.jwt);
  setActiveLivekitRoom(lkRoom);
  await lkRoom.localParticipant.setMicrophoneEnabled(true);

  useRtcStore.getState().setActiveCall({
    accountId,
    roomId,
    roomName: room.name,
    micMuted: false,
    cameraOn: false,
    screenSharing: false,
  });
  refreshParticipants(lkRoom);

  active = {
    client,
    accountId,
    roomId,
    session,
    lkRoom,
    keyProvider,
    teardownMatrix,
    teardownLk,
  };
}

function waitForJoin(session: MatrixRTCSession): Promise<void> {
  if (session.isJoined()) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const onChange = (isJoined: boolean) => {
      if (isJoined) {
        session.off(MatrixRTCSessionEvent.JoinStateChanged, onChange);
        resolve();
      }
    };
    session.on(MatrixRTCSessionEvent.JoinStateChanged, onChange);
  });
}

function wireLivekitEvents(lkRoom: LivekitRoom): () => void {
  const onParticipantChange = () => refreshParticipants(lkRoom);
  lkRoom.on(LivekitRoomEvent.ParticipantConnected, onParticipantChange);
  lkRoom.on(LivekitRoomEvent.ParticipantDisconnected, onParticipantChange);
  lkRoom.on(LivekitRoomEvent.TrackPublished, onParticipantChange);
  lkRoom.on(LivekitRoomEvent.TrackUnpublished, onParticipantChange);
  lkRoom.on(LivekitRoomEvent.TrackMuted, onParticipantChange);
  lkRoom.on(LivekitRoomEvent.TrackUnmuted, onParticipantChange);
  return () => {
    lkRoom.off(LivekitRoomEvent.ParticipantConnected, onParticipantChange);
    lkRoom.off(LivekitRoomEvent.ParticipantDisconnected, onParticipantChange);
    lkRoom.off(LivekitRoomEvent.TrackPublished, onParticipantChange);
    lkRoom.off(LivekitRoomEvent.TrackUnpublished, onParticipantChange);
    lkRoom.off(LivekitRoomEvent.TrackMuted, onParticipantChange);
    lkRoom.off(LivekitRoomEvent.TrackUnmuted, onParticipantChange);
  };
}

function refreshParticipants(lkRoom: LivekitRoom): void {
  const local = lkRoom.localParticipant;
  const remotes = Array.from(lkRoom.remoteParticipants.values()) as RemoteParticipant[];
  const all: (LocalParticipant | RemoteParticipant)[] = [local, ...remotes];
  useRtcStore.getState().setParticipants(
    all.map((p) => ({
      identity: p.identity,
      displayName: p.name || p.identity,
      micMuted: !p.isMicrophoneEnabled,
      cameraOn: p.isCameraEnabled,
      screenSharing: p.getTrackPublications().some((pub) => pub.source === Track.Source.ScreenShare),
    })),
  );
}

export async function leaveActiveCall(): Promise<void> {
  if (!active) {
    useRtcStore.getState().setActiveCall(null);
    useRtcStore.getState().setParticipants([]);
    return;
  }
  const { session, lkRoom, teardownMatrix, teardownLk } = active;
  active = null;
  teardownLk();
  teardownMatrix();
  try {
    await lkRoom.disconnect();
  } catch (err) {
    console.warn('LiveKit disconnect error:', err);
  }
  try {
    await session.leaveRoomSession();
  } catch (err) {
    console.warn('MatrixRTC leave error:', err);
  }
  setActiveLivekitRoom(null);
  useRtcStore.getState().setActiveCall(null);
  useRtcStore.getState().setParticipants([]);
}

export async function applyMicState(unmuted: boolean): Promise<void> {
  if (!active) return;
  await active.lkRoom.localParticipant.setMicrophoneEnabled(unmuted);
  refreshParticipants(active.lkRoom);
}

export async function applyCameraState(on: boolean): Promise<void> {
  if (!active) return;
  await active.lkRoom.localParticipant.setCameraEnabled(on);
  refreshParticipants(active.lkRoom);
}

export async function applyScreenShareState(sharing: boolean): Promise<void> {
  if (!active) return;
  await active.lkRoom.localParticipant.setScreenShareEnabled(sharing);
  refreshParticipants(active.lkRoom);
}
