import { create } from 'zustand';

export interface ParticipantState {
  identity: string;
  displayName: string;
  micMuted: boolean;
  cameraOn: boolean;
  screenSharing: boolean;
}

export interface ActiveCall {
  accountId: string;
  roomId: string;
  roomName: string;
  micMuted: boolean;
  cameraOn: boolean;
  screenSharing: boolean;
}

interface RtcState {
  activeCall: ActiveCall | null;
  participants: ParticipantState[];
  setActiveCall: (call: ActiveCall | null) => void;
  patchActiveCall: (patch: Partial<ActiveCall>) => void;
  setParticipants: (ps: ParticipantState[]) => void;
}

export const useRtcStore = create<RtcState>((set) => ({
  activeCall: null,
  participants: [],
  setActiveCall: (call) => set({ activeCall: call, participants: call ? [] : [] }),
  patchActiveCall: (patch) =>
    set((s) => ({ activeCall: s.activeCall ? { ...s.activeCall, ...patch } : null })),
  setParticipants: (ps) => set({ participants: ps }),
}));
