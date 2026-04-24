import { create } from 'zustand';

interface UiState {
  memberListOpen: boolean;
  toggleMemberList: () => void;
  setMemberListOpen: (open: boolean) => void;

  threadRootId: string | null;
  setThreadRoot: (id: string | null) => void;

  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;

  loginAnotherOpen: boolean;
  setLoginAnotherOpen: (open: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  memberListOpen: true,
  toggleMemberList: () => set((s) => ({ memberListOpen: !s.memberListOpen })),
  setMemberListOpen: (open) => set({ memberListOpen: open }),

  threadRootId: null,
  setThreadRoot: (id) => set({ threadRootId: id }),

  settingsOpen: false,
  setSettingsOpen: (open) => set({ settingsOpen: open }),

  loginAnotherOpen: false,
  setLoginAnotherOpen: (open) => set({ loginAnotherOpen: open }),
}));
