// MatrixRTC call lifecycle.
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
import {
  RoomEvent as LivekitRoomEvent,
  Room as LivekitRoomClass,
  Track,
  ParticipantEvent,
  ConnectionState,
} from 'livekit-client';
import type {
  Room as LivekitRoom,
  RemoteParticipant,
  LocalParticipant,
  Participant,
} from 'livekit-client';
import type { MatrixRTCSession } from 'matrix-js-sdk/lib/matrixrtc/MatrixRTCSession';
import { MatrixRTCSessionEvent } from 'matrix-js-sdk/lib/matrixrtc/MatrixRTCSession';
import type { LivekitFocus } from './discovery';
import { discoverRtcFoci } from './discovery';
import { getLivekitToken } from './livekit';
import { MatrixKeyProvider, bridgeMatrixKeysIntoLivekit } from './encryption';
import { setActiveLivekitRoom } from './session-bridge';
import { useRtcStore, type ParticipantState } from '@/state/rtc';
import { useVoicePrefs, useDeafenStore, DEFAULT_DEVICE } from '@/state/voicePrefs';

interface ActiveSession {
  client: MatrixClient;
  accountId: string;
  roomId: string;
  session: MatrixRTCSession;
  lkRoom: LivekitRoom;
  keyProvider: MatrixKeyProvider;
  teardownMatrix: () => void;
  teardownLk: () => void;
  unsubVoicePrefs: () => void;
  unsubDeafen: () => void;
  participantTeardowns: Map<string, () => void>;
}

let active: ActiveSession | null = null;

export function getActiveSessionRoomId(): string | null {
  return active?.roomId ?? null;
}

export async function joinCallInternal(
  client: MatrixClient,
  accountId: string,
  roomId: string,
): Promise<void> {
  if (active) await leaveActiveCall();

  const room = client.getRoom(roomId);
  if (!room) throw new Error(`Unknown room ${roomId}`);

  useRtcStore.getState().setActiveCall({
    accountId,
    roomId,
    roomName: room.name,
    startedAt: Date.now(),
    micMuted: false,
    cameraOn: false,
    screenSharing: false,
    deafened: useDeafenStore.getState().deafened,
    connecting: true,
  });

  try {
    const homeserverUrl = client.getHomeserverUrl();
    const foci = await discoverRtcFoci(homeserverUrl);
    if (foci.length === 0) {
      throw new Error('This homeserver has no MatrixRTC backend configured.');
    }
    const focus = foci[0];

    const session = client.matrixRTC.getRoomSession(room);
    const keyProvider = new MatrixKeyProvider();

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
    const participantTeardowns = new Map<string, () => void>();
    const teardownLk = wireLivekitEvents(lkRoom, participantTeardowns);

    const transport: LivekitFocus = focus;
    session.joinRoomSession([transport], undefined, {
      unstableSendStickyEvents: true,
    });
    await waitForJoin(session);

    await lkRoom.connect(token.url, token.jwt);
    setActiveLivekitRoom(lkRoom);

    // Apply persisted device prefs before publishing, then enable mic.
    const prefs = useVoicePrefs.getState();
    if (prefs.micDeviceId !== DEFAULT_DEVICE) {
      try {
        await lkRoom.switchActiveDevice('audioinput', prefs.micDeviceId, false);
      } catch (err) {
        console.warn('Could not switch audio input device:', err);
      }
    }
    await lkRoom.localParticipant.setMicrophoneEnabled(true, {
      echoCancellation: prefs.echoCancellation,
      noiseSuppression: prefs.noiseSuppression,
      autoGainControl: prefs.autoGainControl,
    });

    // Track local participant + already-present remotes.
    trackParticipant(lkRoom, lkRoom.localParticipant, participantTeardowns);
    for (const p of lkRoom.remoteParticipants.values()) {
      trackParticipant(lkRoom, p as RemoteParticipant, participantTeardowns);
    }
    refreshParticipants(lkRoom);

    // Subscribe to voice-prefs changes so device choice / DSP toggles update live.
    const unsubVoicePrefs = useVoicePrefs.subscribe((state, prev) => {
      void applyVoicePrefsDiff(lkRoom, state, prev);
    });
    const unsubDeafen = useDeafenStore.subscribe((state, prev) => {
      if (state.deafened === prev.deafened) return;
      useRtcStore.getState().patchActiveCall({ deafened: state.deafened });
      applyDeafenToVolumes(lkRoom, state.deafened);
    });

    useRtcStore.getState().patchActiveCall({ connecting: false });

    active = {
      client,
      accountId,
      roomId,
      session,
      lkRoom,
      keyProvider,
      teardownMatrix,
      teardownLk,
      unsubVoicePrefs,
      unsubDeafen,
      participantTeardowns,
    };
  } catch (err) {
    // If anything failed, make sure we don't leave a phantom active call.
    useRtcStore.getState().setActiveCall(null);
    setActiveLivekitRoom(null);
    throw err;
  }
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

function wireLivekitEvents(
  lkRoom: LivekitRoom,
  participantTeardowns: Map<string, () => void>,
): () => void {
  const onParticipantConnected = (p: RemoteParticipant) => {
    trackParticipant(lkRoom, p, participantTeardowns);
    refreshParticipants(lkRoom);
  };
  const onParticipantDisconnected = (p: RemoteParticipant) => {
    const teardown = participantTeardowns.get(p.identity);
    if (teardown) {
      teardown();
      participantTeardowns.delete(p.identity);
    }
    refreshParticipants(lkRoom);
  };
  const onTrackChange = () => refreshParticipants(lkRoom);
  const onActiveSpeakers = (speakers: Participant[]) => {
    const ids = new Set(speakers.map((s) => s.identity));
    const ps = useRtcStore.getState().participants;
    let changed = false;
    const next = ps.map((p) => {
      const speaking = ids.has(p.identity);
      if (speaking === p.isSpeaking) return p;
      changed = true;
      return { ...p, isSpeaking: speaking };
    });
    if (changed) useRtcStore.getState().setParticipants(next);
  };
  const onConnectionStateChanged = (state: ConnectionState) => {
    const reconnecting =
      state === ConnectionState.Reconnecting || state === ConnectionState.SignalReconnecting;
    if (reconnecting) {
      useRtcStore.getState().patchActiveCall({ connecting: true });
    } else if (state === ConnectionState.Connected) {
      useRtcStore.getState().patchActiveCall({ connecting: false });
    }
  };

  lkRoom.on(LivekitRoomEvent.ParticipantConnected, onParticipantConnected);
  lkRoom.on(LivekitRoomEvent.ParticipantDisconnected, onParticipantDisconnected);
  lkRoom.on(LivekitRoomEvent.TrackPublished, onTrackChange);
  lkRoom.on(LivekitRoomEvent.TrackUnpublished, onTrackChange);
  lkRoom.on(LivekitRoomEvent.TrackSubscribed, onTrackChange);
  lkRoom.on(LivekitRoomEvent.TrackUnsubscribed, onTrackChange);
  lkRoom.on(LivekitRoomEvent.TrackMuted, onTrackChange);
  lkRoom.on(LivekitRoomEvent.TrackUnmuted, onTrackChange);
  lkRoom.on(LivekitRoomEvent.LocalTrackPublished, onTrackChange);
  lkRoom.on(LivekitRoomEvent.LocalTrackUnpublished, onTrackChange);
  lkRoom.on(LivekitRoomEvent.ActiveSpeakersChanged, onActiveSpeakers);
  lkRoom.on(LivekitRoomEvent.ConnectionStateChanged, onConnectionStateChanged);

  return () => {
    lkRoom.off(LivekitRoomEvent.ParticipantConnected, onParticipantConnected);
    lkRoom.off(LivekitRoomEvent.ParticipantDisconnected, onParticipantDisconnected);
    lkRoom.off(LivekitRoomEvent.TrackPublished, onTrackChange);
    lkRoom.off(LivekitRoomEvent.TrackUnpublished, onTrackChange);
    lkRoom.off(LivekitRoomEvent.TrackSubscribed, onTrackChange);
    lkRoom.off(LivekitRoomEvent.TrackUnsubscribed, onTrackChange);
    lkRoom.off(LivekitRoomEvent.TrackMuted, onTrackChange);
    lkRoom.off(LivekitRoomEvent.TrackUnmuted, onTrackChange);
    lkRoom.off(LivekitRoomEvent.LocalTrackPublished, onTrackChange);
    lkRoom.off(LivekitRoomEvent.LocalTrackUnpublished, onTrackChange);
    lkRoom.off(LivekitRoomEvent.ActiveSpeakersChanged, onActiveSpeakers);
    lkRoom.off(LivekitRoomEvent.ConnectionStateChanged, onConnectionStateChanged);
    for (const t of participantTeardowns.values()) t();
    participantTeardowns.clear();
  };
}

function trackParticipant(
  lkRoom: LivekitRoom,
  p: Participant,
  teardowns: Map<string, () => void>,
): void {
  if (teardowns.has(p.identity)) return;

  const onMuteChange = () => refreshParticipants(lkRoom);
  const onSpeakingChange = (speaking: boolean) => {
    useRtcStore.getState().patchParticipant(p.identity, { isSpeaking: speaking });
  };

  p.on(ParticipantEvent.TrackMuted, onMuteChange);
  p.on(ParticipantEvent.TrackUnmuted, onMuteChange);
  p.on(ParticipantEvent.IsSpeakingChanged, onSpeakingChange);

  teardowns.set(p.identity, () => {
    p.off(ParticipantEvent.TrackMuted, onMuteChange);
    p.off(ParticipantEvent.TrackUnmuted, onMuteChange);
    p.off(ParticipantEvent.IsSpeakingChanged, onSpeakingChange);
  });
}

function refreshParticipants(lkRoom: LivekitRoom): void {
  const local = lkRoom.localParticipant;
  const remotes = Array.from(lkRoom.remoteParticipants.values()) as RemoteParticipant[];
  const all: (LocalParticipant | RemoteParticipant)[] = [local, ...remotes];
  const prev = new Map(useRtcStore.getState().participants.map((p) => [p.identity, p]));
  const next: ParticipantState[] = all.map((p) => {
    const isLocal = p === local;
    const previous = prev.get(p.identity);
    return {
      identity: p.identity,
      displayName: p.name || p.identity,
      isLocal,
      micMuted: !p.isMicrophoneEnabled,
      cameraOn: p.isCameraEnabled,
      screenSharing: p
        .getTrackPublications()
        .some((pub) => pub.source === Track.Source.ScreenShare && !pub.isMuted),
      isSpeaking: previous?.isSpeaking ?? p.isSpeaking ?? false,
      audioLevel: previous?.audioLevel ?? 0,
      connection: 'connected',
    };
  });
  useRtcStore.getState().setParticipants(next);

  // Mirror local state into activeCall for the overlay controls.
  const call = useRtcStore.getState().activeCall;
  if (call) {
    const localState = next.find((p) => p.isLocal);
    if (localState) {
      const screenSharing = localState.screenSharing;
      if (
        call.micMuted !== localState.micMuted ||
        call.cameraOn !== localState.cameraOn ||
        call.screenSharing !== screenSharing
      ) {
        useRtcStore.getState().patchActiveCall({
          micMuted: localState.micMuted,
          cameraOn: localState.cameraOn,
          screenSharing,
        });
      }
    }
  }
}

async function applyVoicePrefsDiff(
  lkRoom: LivekitRoom,
  state: ReturnType<typeof useVoicePrefs.getState>,
  prev: ReturnType<typeof useVoicePrefs.getState>,
): Promise<void> {
  if (state.micDeviceId !== prev.micDeviceId && state.micDeviceId !== DEFAULT_DEVICE) {
    try {
      await lkRoom.switchActiveDevice('audioinput', state.micDeviceId, false);
    } catch (err) {
      console.warn('Switch mic failed:', err);
    }
  }
  if (state.speakerDeviceId !== prev.speakerDeviceId && state.speakerDeviceId !== DEFAULT_DEVICE) {
    try {
      await lkRoom.switchActiveDevice('audiooutput', state.speakerDeviceId, false);
    } catch (err) {
      console.warn('Switch speaker failed:', err);
    }
  }
  if (state.cameraDeviceId !== prev.cameraDeviceId && state.cameraDeviceId !== DEFAULT_DEVICE) {
    try {
      await lkRoom.switchActiveDevice('videoinput', state.cameraDeviceId, false);
    } catch (err) {
      console.warn('Switch camera failed:', err);
    }
  }
  if (state.outputVolume !== prev.outputVolume) {
    applyDeafenToVolumes(lkRoom, useDeafenStore.getState().deafened);
  }
}

function applyDeafenToVolumes(lkRoom: LivekitRoom, deafened: boolean): void {
  const baseVol = useVoicePrefs.getState().outputVolume;
  const target = deafened ? 0 : baseVol;
  for (const p of lkRoom.remoteParticipants.values()) {
    try {
      p.setVolume(target);
    } catch {
      // setVolume isn't available on every participant; safe to ignore.
    }
  }
}

export async function leaveActiveCall(): Promise<void> {
  if (!active) {
    useRtcStore.getState().setActiveCall(null);
    useRtcStore.getState().setParticipants([]);
    return;
  }
  const {
    session,
    lkRoom,
    teardownMatrix,
    teardownLk,
    unsubVoicePrefs,
    unsubDeafen,
  } = active;
  active = null;
  unsubVoicePrefs();
  unsubDeafen();
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
  const prefs = useVoicePrefs.getState();
  await active.lkRoom.localParticipant.setMicrophoneEnabled(unmuted, {
    echoCancellation: prefs.echoCancellation,
    noiseSuppression: prefs.noiseSuppression,
    autoGainControl: prefs.autoGainControl,
  });
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
