import { useEffect, useState } from 'react';
import { ServerRail } from '@/ui/shell/ServerRail';
import { RoomList } from '@/ui/shell/RoomList';
import { MainPane } from '@/ui/shell/MainPane';
import { MemberList } from '@/ui/shell/MemberList';
import { TitleBar } from '@/ui/shell/TitleBar';
import { LoginView } from '@/ui/auth/LoginView';
import { accountManager } from '@/matrix/AccountManager';
import { useAccountsStore } from '@/state/accounts';
import { useUiStore } from '@/state/ui';
import { CallOverlay } from '@/ui/rtc/CallOverlay';
import { ThreadPane } from '@/ui/timeline/ThreadPane';
import { SettingsDialog } from '@/ui/settings/SettingsDialog';
import { LoginAnotherDialog } from '@/ui/auth/LoginAnotherDialog';
import { ImageLightbox } from '@/ui/timeline/ImageLightbox';
import { ProfileCard } from '@/ui/shell/ProfileCard';
import { CommandPalette } from '@/ui/shell/CommandPalette';
import { TooltipProvider } from '@/ui/primitives/tooltip';
import { Toaster } from '@/ui/primitives/sonner';
import { useApplyTheme } from '@/lib/theme';
import { StartDmDialog } from '@/ui/dialogs/StartDmDialog';
import { CreateRoomDialog } from '@/ui/dialogs/CreateRoomDialog';
import { CreateSpaceDialog } from '@/ui/dialogs/CreateSpaceDialog';
import { RoomSettingsDialog } from '@/ui/dialogs/RoomSettingsDialog';
import { SpaceSettingsDialog } from '@/ui/dialogs/SpaceSettingsDialog';

export function App() {
  useApplyTheme();
  const [booting, setBooting] = useState(true);
  const hasAccounts = useAccountsStore((s) => Object.keys(s.accounts).length > 0);
  const memberListOpen = useUiStore((s) => s.memberListOpen);
  const settingsOpen = useUiStore((s) => s.settingsOpen);
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen);
  const loginAnotherOpen = useUiStore((s) => s.loginAnotherOpen);
  const setLoginAnotherOpen = useUiStore((s) => s.setLoginAnotherOpen);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await accountManager.hydrateFromMain();
      } catch (err) {
        console.error('Failed to hydrate accounts:', err);
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return window.native.notifications.onClicked(({ accountId, roomId }) => {
      useAccountsStore.getState().setActiveAccount(accountId);
      useAccountsStore.getState().setActiveRoom(roomId);
    });
  }, []);

  // Base UI dialogs and popovers handle Escape themselves. This only covers
  // in-app overlays that aren't dialogs yet: the thread pane and the "clear
  // active room" fallback.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      const ui = useUiStore.getState();
      if (ui.threadRootId) {
        ui.setThreadRoot(null);
      } else if (useAccountsStore.getState().activeRoomId) {
        useAccountsStore.getState().setActiveRoom(null);
      } else {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (booting) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[var(--color-bg)] text-sm text-[var(--color-text-muted)]">
        Loading…
      </div>
    );
  }

  if (!hasAccounts) {
    return (
      <TooltipProvider>
        <LoginView />
        <Toaster />
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <div className="flex h-full w-full select-none flex-col overflow-hidden bg-[var(--color-bg)] text-[var(--color-text)]">
        <TitleBar />
        <div className="flex min-h-0 flex-1">
          <ServerRail />
          <RoomList />
          <MainPane />
          <ThreadPane />
          {memberListOpen && <MemberList />}
        </div>
        <CallOverlay />
        <ImageLightbox />
        <ProfileCard />
        <CommandPalette />
        <StartDmDialog />
        <CreateRoomDialog />
        <CreateSpaceDialog />
        <RoomSettingsDialog />
        <SpaceSettingsDialog />
        {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
        {loginAnotherOpen && <LoginAnotherDialog onClose={() => setLoginAnotherOpen(false)} />}
      </div>
      <Toaster />
    </TooltipProvider>
  );
}
