import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const DEFAULT_DEVICE = 'default';

export interface VoicePrefsState {
  micDeviceId: string;
  speakerDeviceId: string;
  cameraDeviceId: string;
  inputVolume: number;
  outputVolume: number;
  noiseSuppression: boolean;
  echoCancellation: boolean;
  autoGainControl: boolean;

  setMicDevice: (id: string) => void;
  setSpeakerDevice: (id: string) => void;
  setCameraDevice: (id: string) => void;
  setInputVolume: (v: number) => void;
  setOutputVolume: (v: number) => void;
  setNoiseSuppression: (v: boolean) => void;
  setEchoCancellation: (v: boolean) => void;
  setAutoGainControl: (v: boolean) => void;
}

export const useVoicePrefs = create<VoicePrefsState>()(
  persist(
    (set) => ({
      micDeviceId: DEFAULT_DEVICE,
      speakerDeviceId: DEFAULT_DEVICE,
      cameraDeviceId: DEFAULT_DEVICE,
      inputVolume: 1,
      outputVolume: 1,
      noiseSuppression: true,
      echoCancellation: true,
      autoGainControl: true,

      setMicDevice: (id) => set({ micDeviceId: id }),
      setSpeakerDevice: (id) => set({ speakerDeviceId: id }),
      setCameraDevice: (id) => set({ cameraDeviceId: id }),
      setInputVolume: (v) => set({ inputVolume: clamp01(v) }),
      setOutputVolume: (v) => set({ outputVolume: clamp01(v) }),
      setNoiseSuppression: (v) => set({ noiseSuppression: v }),
      setEchoCancellation: (v) => set({ echoCancellation: v }),
      setAutoGainControl: (v) => set({ autoGainControl: v }),
    }),
    { name: 'voice-prefs' },
  ),
);

function clamp01(v: number): number {
  if (Number.isNaN(v)) return 0;
  if (v < 0) return 0;
  if (v > 2) return 2;
  return v;
}

export interface DeafenState {
  deafened: boolean;
  setDeafened: (v: boolean) => void;
  toggle: () => void;
}

export const useDeafenStore = create<DeafenState>((set) => ({
  deafened: false,
  setDeafened: (v) => set({ deafened: v }),
  toggle: () => set((s) => ({ deafened: !s.deafened })),
}));
