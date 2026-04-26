import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface LightboxImage {
  mxc?: string | null;
  file?: unknown;
  mimetype?: string | undefined;
  alt?: string;
}

export interface ProfileCardAnchor {
  x: number;
  y: number;
}

export interface ProfileCardTarget {
  userId: string;
  accountId: string;
  roomId: string | null;
  anchor: ProfileCardAnchor;
}

const DEFAULT_REACTIONS = ['👍', '❤️', '😂', '🎉', '🙏'];

export type ThemePreference = 'system' | 'dark' | 'light';

interface UiState {
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;

  memberListOpen: boolean;
  toggleMemberList: () => void;
  setMemberListOpen: (open: boolean) => void;

  threadRootId: string | null;
  setThreadRoot: (id: string | null) => void;

  replyToId: string | null;
  setReplyTo: (id: string | null) => void;

  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;

  loginAnotherOpen: boolean;
  setLoginAnotherOpen: (open: boolean) => void;

  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;

  startDmOpen: boolean;
  setStartDmOpen: (open: boolean) => void;

  // null = closed; { parentSpaceId: string | null } = open, optionally pinned
  // to a parent space (when the user creates a room from inside a space).
  createRoomOpen: { parentSpaceId: string | null } | null;
  setCreateRoomOpen: (state: { parentSpaceId: string | null } | null) => void;

  createSpaceOpen: boolean;
  setCreateSpaceOpen: (open: boolean) => void;

  // The room/space whose settings dialog is open, if any. Stored separately
  // so a room can be active while its settings are closed (and vice versa).
  roomSettingsForId: string | null;
  setRoomSettingsForId: (roomId: string | null) => void;

  spaceSettingsForId: string | null;
  setSpaceSettingsForId: (roomId: string | null) => void;

  lightbox: LightboxImage | null;
  openLightbox: (image: LightboxImage) => void;
  closeLightbox: () => void;

  profileCard: ProfileCardTarget | null;
  openProfileCard: (target: ProfileCardTarget) => void;
  closeProfileCard: () => void;

  // Persisted: user's preferred quick-reaction emoji list.
  quickReactions: string[];
  setQuickReactions: (list: string[]) => void;

  // Persisted: last-selected room per "view". The key is
  //   `${accountId}::space::${spaceRoomId}` or `${accountId}::home`
  // so home vs each space each get their own memory.
  lastRoomByView: Record<string, string>;
  rememberRoomForView: (key: string, roomId: string) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      theme: 'system',
      setTheme: (theme) => set({ theme }),

      memberListOpen: true,
      toggleMemberList: () => set((s) => ({ memberListOpen: !s.memberListOpen })),
      setMemberListOpen: (open) => set({ memberListOpen: open }),

      threadRootId: null,
      setThreadRoot: (id) => set({ threadRootId: id }),

      replyToId: null,
      setReplyTo: (id) => set({ replyToId: id }),

      settingsOpen: false,
      setSettingsOpen: (open) => set({ settingsOpen: open }),

      loginAnotherOpen: false,
      setLoginAnotherOpen: (open) => set({ loginAnotherOpen: open }),

      commandPaletteOpen: false,
      setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),

      startDmOpen: false,
      setStartDmOpen: (open) => set({ startDmOpen: open }),

      createRoomOpen: null,
      setCreateRoomOpen: (state) => set({ createRoomOpen: state }),

      createSpaceOpen: false,
      setCreateSpaceOpen: (open) => set({ createSpaceOpen: open }),

      roomSettingsForId: null,
      setRoomSettingsForId: (roomId) => set({ roomSettingsForId: roomId }),

      spaceSettingsForId: null,
      setSpaceSettingsForId: (roomId) => set({ spaceSettingsForId: roomId }),

      lightbox: null,
      openLightbox: (image) => set({ lightbox: image }),
      closeLightbox: () => set({ lightbox: null }),

      profileCard: null,
      openProfileCard: (target) =>
        set((s) => {
          // Re-clicking the same user toggles the card closed instead of
          // re-opening it on top of itself, matching how badges and popovers
          // usually behave.
          const cur = s.profileCard;
          if (cur && cur.userId === target.userId && cur.accountId === target.accountId) {
            return { profileCard: null };
          }
          return { profileCard: target };
        }),
      closeProfileCard: () => set({ profileCard: null }),

      quickReactions: DEFAULT_REACTIONS,
      setQuickReactions: (list) => set({ quickReactions: list }),

      lastRoomByView: {},
      rememberRoomForView: (key, roomId) =>
        set((s) => ({ lastRoomByView: { ...s.lastRoomByView, [key]: roomId } })),
    }),
    {
      name: 'ui',
      partialize: (state) => ({
        quickReactions: state.quickReactions,
        lastRoomByView: state.lastRoomByView,
        memberListOpen: state.memberListOpen,
        theme: state.theme,
      }),
    },
  ),
);

export function viewKeyFor(accountId: string, spaceId: string | null): string {
  return spaceId ? `${accountId}::space::${spaceId}` : `${accountId}::home`;
}
