import { create } from 'zustand';
import type { SyncState } from 'matrix-js-sdk';
import type { AccountMetadata } from '@shared/types';

interface AccountRecord extends AccountMetadata {
  syncState?: SyncState;
}

interface AccountsState {
  accounts: Record<string, AccountRecord>;
  activeAccountId: string | null;
  activeRoomId: string | null;
  activeSpaceId: string | null;

  upsert: (metadata: AccountMetadata) => void;
  remove: (accountId: string) => void;
  setSyncState: (accountId: string, state: SyncState) => void;
  setActiveAccount: (accountId: string | null) => void;
  setActiveRoom: (roomId: string | null) => void;
  setActiveSpace: (roomId: string | null) => void;
}

export const useAccountsStore = create<AccountsState>((set) => ({
  accounts: {},
  activeAccountId: null,
  activeRoomId: null,
  activeSpaceId: null,

  upsert: (metadata) =>
    set((state) => {
      const existing = state.accounts[metadata.id];
      return {
        accounts: { ...state.accounts, [metadata.id]: { ...existing, ...metadata } },
        activeAccountId: state.activeAccountId ?? metadata.id,
      };
    }),

  remove: (accountId) =>
    set((state) => {
      const { [accountId]: _removed, ...rest } = state.accounts;
      if (state.activeAccountId !== accountId) {
        return { accounts: rest };
      }
      const nextActive = Object.keys(rest)[0] ?? null;
      return {
        accounts: rest,
        activeAccountId: nextActive,
        activeRoomId: null,
        activeSpaceId: null,
      };
    }),

  setSyncState: (accountId, syncState) =>
    set((state) => {
      const existing = state.accounts[accountId];
      if (!existing) return state;
      return {
        accounts: { ...state.accounts, [accountId]: { ...existing, syncState } },
      };
    }),

  setActiveAccount: (accountId) =>
    set({ activeAccountId: accountId, activeRoomId: null, activeSpaceId: null }),
  setActiveRoom: (roomId) => set({ activeRoomId: roomId }),
  setActiveSpace: (roomId) => set({ activeSpaceId: roomId, activeRoomId: null }),
}));
