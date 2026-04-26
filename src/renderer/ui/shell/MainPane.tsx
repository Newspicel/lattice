import { Hash, Lock, Phone, Settings as SettingsIcon, Users, Volume2 } from 'lucide-react';
import { useAccountsStore } from '@/state/accounts';
import { useRoomsStore } from '@/state/rooms';
import { Timeline } from '@/ui/timeline/Timeline';
import { Composer } from '@/ui/composer/Composer';
import { VoiceChannelView } from '@/ui/rtc/VoiceChannelView';
import { useUiStore } from '@/state/ui';
import { startCall } from '@/matrix/rtc/RtcSession';
import { accountManager } from '@/matrix/AccountManager';
import { RequestBanner } from '@/ui/shell/RequestBanner';

export function MainPane() {
  const activeAccountId = useAccountsStore((s) => s.activeAccountId);
  const activeRoomId = useAccountsStore((s) => s.activeRoomId);
  const toggleMembers = useUiStore((s) => s.toggleMemberList);
  const setRoomSettingsForId = useUiStore((s) => s.setRoomSettingsForId);

  const room = useRoomsStore((s) => {
    if (!activeAccountId || !activeRoomId) return null;
    const rooms = s.byAccount[activeAccountId];
    if (!rooms) return null;
    return rooms.find((r) => r.roomId === activeRoomId) ?? null;
  });

  const client = activeAccountId ? accountManager.getClient(activeAccountId) ?? null : null;

  async function onStartCall() {
    if (!activeAccountId || !activeRoomId || !client) return;
    await startCall(client, activeAccountId, activeRoomId);
  }

  return (
    <section className="flex h-full flex-1 flex-col bg-[var(--color-panel-2)]">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-[var(--color-divider)] px-4">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <HeaderRoomIcon
            isVoice={!!room?.isVoice}
            isEncrypted={!!room?.isEncrypted}
          />
          <h1 className="truncate text-sm font-semibold tracking-tight text-[var(--color-text-strong)]">
            {room?.name ?? 'Select a room'}
          </h1>
          {room?.topic && (
            <>
              <span aria-hidden className="h-3 w-px bg-[var(--color-divider)]" />
              <span className="truncate text-xs text-[var(--color-text-muted)]">
                {room.topic}
              </span>
            </>
          )}
        </div>
        <div className="flex items-center">
          {room && !room.isVoice && !room.isInvite && (
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-hover-overlay)] hover:text-[var(--color-text-strong)]"
              title="Start call"
              onClick={onStartCall}
            >
              <Phone className="h-4 w-4" strokeWidth={1.75} />
            </button>
          )}
          {room && !room.isInvite && (
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-hover-overlay)] hover:text-[var(--color-text-strong)]"
              title="Room settings"
              onClick={() => setRoomSettingsForId(room.roomId)}
            >
              <SettingsIcon className="h-4 w-4" strokeWidth={1.75} />
            </button>
          )}
          {!room?.isInvite && (
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-hover-overlay)] hover:text-[var(--color-text-strong)]"
              title="Toggle member list"
              onClick={toggleMembers}
            >
              <Users className="h-4 w-4" strokeWidth={1.75} />
            </button>
          )}
        </div>
      </header>

      {room?.isInvite && client ? (
        <RequestBanner room={room} client={client} />
      ) : room?.isVoice ? (
        <VoiceChannelView room={room} />
      ) : (
        <>
          <Timeline />
          <Composer />
        </>
      )}
    </section>
  );
}

function HeaderRoomIcon({
  isVoice,
  isEncrypted,
}: {
  isVoice: boolean;
  isEncrypted: boolean;
}) {
  const Icon = isVoice ? Volume2 : Hash;
  return (
    <span className="relative inline-flex h-4 w-4 items-center justify-center text-[var(--color-text-muted)]">
      <Icon className="h-4 w-4" strokeWidth={1.75} />
      {isEncrypted && (
        <Lock
          aria-label="Encrypted"
          className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 text-emerald-500"
          strokeWidth={3}
        />
      )}
    </span>
  );
}
