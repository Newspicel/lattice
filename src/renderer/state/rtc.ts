import { create } from 'zustand';

export interface ParticipantState {
  identity: string;
  displayName: string;
  isLocal: boolean;
  micMuted: boolean;
  cameraOn: boolean;
  screenSharing: boolean;
  isSpeaking: boolean;
  audioLevel: number;
  connection: 'connected' | 'reconnecting' | 'disconnected';
}

export interface ActiveCall {
  accountId: string;
  roomId: string;
  roomName: string;
  startedAt: number;
  micMuted: boolean;
  cameraOn: boolean;
  screenSharing: boolean;
  deafened: boolean;
  connecting: boolean;
}

interface RtcState {
  activeCall: ActiveCall | null;
  participants: ParticipantState[];
  setActiveCall: (call: ActiveCall | null) => void;
  patchActiveCall: (patch: Partial<ActiveCall>) => void;
  setParticipants: (ps: ParticipantState[]) => void;
  patchParticipant: (identity: string, patch: Partial<ParticipantState>) => void;
}

export const useRtcStore = create<RtcState>((set) => ({
  activeCall: null,
  participants: [],
  setActiveCall: (call) =>
    set((s) => ({
      activeCall: call,
      participants: call ? s.participants : [],
    })),
  patchActiveCall: (patch) =>
    set((s) => ({ activeCall: s.activeCall ? { ...s.activeCall, ...patch } : null })),
  setParticipants: (ps) => set({ participants: ps }),
  patchParticipant: (identity, patch) =>
    set((s) => ({
      participants: s.participants.map((p) =>
        p.identity === identity ? { ...p, ...patch } : p,
      ),
    })),
}));
