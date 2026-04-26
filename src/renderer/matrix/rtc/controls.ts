// Call control facade. The concrete implementation lives in ./lifecycle.

import { useRtcStore } from '@/state/rtc';
import { useDeafenStore } from '@/state/voicePrefs';

export function toggleMicrophone(): void {
  const call = useRtcStore.getState().activeCall;
  if (!call) return;
  // Optimistically update for snappy UI; lifecycle.refreshParticipants will reconcile.
  useRtcStore.getState().patchActiveCall({ micMuted: !call.micMuted });
  void import('./lifecycle').then((m) => m.applyMicState(call.micMuted));
}

export function toggleCamera(): void {
  const call = useRtcStore.getState().activeCall;
  if (!call) return;
  useRtcStore.getState().patchActiveCall({ cameraOn: !call.cameraOn });
  void import('./lifecycle').then((m) => m.applyCameraState(!call.cameraOn));
}

export function toggleScreenShare(): void {
  const call = useRtcStore.getState().activeCall;
  if (!call) return;
  useRtcStore.getState().patchActiveCall({ screenSharing: !call.screenSharing });
  void import('./lifecycle').then((m) => m.applyScreenShareState(!call.screenSharing));
}

export function toggleDeafen(): void {
  const call = useRtcStore.getState().activeCall;
  if (!call) return;
  // Auto-mute mic while deafened, like Discord.
  const next = !call.deafened;
  useDeafenStore.getState().setDeafened(next);
  if (next && !call.micMuted) {
    toggleMicrophone();
  }
}

export function leaveCall(): void {
  void import('./lifecycle').then((m) => m.leaveActiveCall());
}
