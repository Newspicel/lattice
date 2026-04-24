import { Hash, Lock, Phone, Users } from 'lucide-react';
import { useAccountsStore } from '@/state/accounts';
import { useRoomsStore } from '@/state/rooms';
import { Timeline } from '@/ui/timeline/Timeline';
import { Composer } from '@/ui/composer/Composer';
import { useUiStore } from '@/state/ui';
import { startCall } from '@/matrix/rtc/RtcSession';
import { accountManager } from '@/matrix/AccountManager';

export function MainPane() {
  const activeAccountId = useAccountsStore((s) => s.activeAccountId);
  const activeRoomId = useAccountsStore((s) => s.activeRoomId);
  const toggleMembers = useUiStore((s) => s.toggleMemberList);

  const room = useRoomsStore((s) => {
    if (!activeAccountId || !activeRoomId) return null;
    const rooms = s.byAccount[activeAccountId];
    if (!rooms) return null;
    return rooms.find((r) => r.roomId === activeRoomId) ?? null;
  });

  async function onStartCall() {
    if (!activeAccountId || !activeRoomId) return;
    const client = accountManager.getClient(activeAccountId);
    if (!client) return;
    await startCall(client, activeAccountId, activeRoomId);
  }

  return (
    <section className="flex h-full flex-1 flex-col bg-[var(--color-panel-2)]">
      <header className="flex h-12 items-center gap-2 border-b border-[var(--color-divider)] px-4 shadow-sm titlebar-drag">
        <div className="flex flex-1 items-center gap-2 titlebar-no-drag">
          {room?.isEncrypted ? (
            <Lock className="h-5 w-5 text-emerald-500" />
          ) : (
            <Hash className="h-5 w-5 text-neutral-400" />
          )}
          <h1 className="font-semibold">{room?.name ?? 'Select a room'}</h1>
          {room?.topic && (
            <span className="ml-2 truncate text-xs text-neutral-400">— {room.topic}</span>
          )}
        </div>
        <div className="flex items-center gap-2 titlebar-no-drag">
          {room && (
            <button
              type="button"
              className="rounded p-1.5 text-neutral-400 hover:bg-white/10 hover:text-white"
              title="Start call"
              onClick={onStartCall}
            >
              <Phone className="h-5 w-5" />
            </button>
          )}
          <button
            type="button"
            className="rounded p-1.5 text-neutral-400 hover:bg-white/10 hover:text-white"
            title="Toggle member list"
            onClick={toggleMembers}
          >
            <Users className="h-5 w-5" />
          </button>
        </div>
      </header>

      <Timeline />
      <Composer />
    </section>
  );
}
