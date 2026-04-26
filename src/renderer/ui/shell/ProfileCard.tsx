import { useEffect, useMemo, useState } from 'react';
import { useUiStore } from '@/state/ui';
import { accountManager } from '@/matrix/AccountManager';
import { AuthedImage } from '@/lib/mxc';
import { Popover as PopoverPrimitive } from '@base-ui/react/popover';

const POWER_LEVEL_TAGS_EVENT = 'in.cinny.room.power_level_tags';

interface PowerLevelTag {
  name?: string;
}

type PowerLevelTags = Record<string, PowerLevelTag>;

interface Profile {
  displayName: string;
  avatarMxc: string | null;
  presence?: string;
  presenceMsg?: string;
  lastActiveAgo?: number;
  currentlyActive?: boolean;
  powerLevel?: number;
  roleName?: string;
  membership?: string;
}

const CARD_WIDTH = 280;

export function ProfileCard() {
  const target = useUiStore((s) => s.profileCard);
  const close = useUiStore((s) => s.closeProfileCard);
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    if (!target) {
      setProfile(null);
      return;
    }
    const client = accountManager.getClient(target.accountId);
    if (!client) return;

    const room = target.roomId ? client.getRoom(target.roomId) : null;
    const member = room?.getMember(target.userId) ?? null;
    const powerLevelTags = room ? readPowerLevelTags(room) : null;
    const cachedUser = client.getUser(target.userId);

    const initial: Profile = {
      displayName: member?.name || target.userId,
      avatarMxc: member?.getMxcAvatarUrl() ?? null,
      powerLevel: member?.powerLevel,
      roleName: findRoleName(member?.powerLevel, powerLevelTags),
      membership: member?.membership,
      presence: cachedUser?.presence,
      presenceMsg: cachedUser?.presenceStatusMsg,
      lastActiveAgo: cachedUser?.lastActiveAgo,
      currentlyActive: cachedUser?.currentlyActive,
    };
    setProfile(initial);

    let cancelled = false;

    // Hit the profile endpoint whenever the room member view is incomplete:
    // either there's no member record (DM targets that lazy-load) or the
    // member exists but has no avatar/displayname stored in the room state,
    // which is common when a user sets their profile globally but has never
    // updated it inside this room.
    const memberAvatar = member?.getMxcAvatarUrl() ?? null;
    const memberDisplayName =
      member?.name && member.name !== target.userId ? member.name : null;
    if (!memberAvatar || !memberDisplayName) {
      client
        .getProfileInfo(target.userId)
        .then((info) => {
          if (cancelled) return;
          setProfile((prev) => ({
            ...(prev ?? initial),
            // Prefer the per-room values when present (Matrix lets a member
            // override their global profile inside a room); fall back to the
            // global profile otherwise.
            displayName: memberDisplayName ?? info?.displayname ?? target.userId,
            avatarMxc: memberAvatar ?? info?.avatar_url ?? null,
          }));
        })
        .catch(() => {});
    }

    // Presence is opt-in / per-homeserver. If the cached User object didn't
    // already know it, ask the homeserver — but ignore failures (many servers
    // disable the endpoint entirely).
    if (!cachedUser?.presence) {
      client
        .getPresence(target.userId)
        .then((res) => {
          if (cancelled) return;
          setProfile((prev) => ({
            ...(prev ?? initial),
            presence: res.presence,
            presenceMsg: res.status_msg ?? prev?.presenceMsg,
            lastActiveAgo: res.last_active_ago ?? prev?.lastActiveAgo,
            currentlyActive: res.currently_active ?? prev?.currentlyActive,
          }));
        })
        .catch(() => {});
    }

    return () => {
      cancelled = true;
    };
  }, [target]);

  // Base UI expects an Element or VirtualElement for anchoring. We only have
  // click coords, so wrap them in a zero-size virtual element — floating-ui
  // will place the popup relative to that point.
  const virtualAnchor = useMemo(() => {
    if (!target) return null;
    const { x, y } = target.anchor;
    return {
      getBoundingClientRect: () =>
        ({
          x,
          y,
          width: 0,
          height: 0,
          top: y,
          left: x,
          right: x,
          bottom: y,
          toJSON: () => ({}),
        }) as DOMRect,
    };
  }, [target]);

  if (!target || !profile) return null;

  const client = accountManager.getClient(target.accountId) ?? null;
  const homeServer = homeServerOf(target.userId);
  const presence = presenceLabel(profile.presence);
  const lastActive = formatLastActive(
    profile.lastActiveAgo,
    profile.currentlyActive,
    profile.presence,
  );
  const membership = membershipLabel(profile.membership);

  return (
    <PopoverPrimitive.Root
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <PopoverPrimitive.Portal>
        {/* Transparent click-trap: any click outside the card lands here
            first and only closes the card, so the underlying click target
            (another username, a button, the composer, etc.) is not also
            activated by the same gesture. */}
        <div
          aria-hidden
          className="fixed inset-0 z-40"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            close();
          }}
        />
        <PopoverPrimitive.Positioner
          anchor={virtualAnchor}
          side="right"
          align="start"
          sideOffset={0}
          collisionPadding={16}
          className="isolate z-50 outline-none"
        >
          <PopoverPrimitive.Popup
            aria-label={`Profile — ${profile.displayName}`}
            style={{ width: CARD_WIDTH }}
            className="overflow-hidden border border-[var(--color-divider)] bg-[var(--color-panel-2)] outline-none data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 transition-opacity duration-150"
          >
            <div className="flex items-start gap-3 border-b border-[var(--color-divider)] bg-[var(--color-panel)] p-4">
              <div className="relative shrink-0">
                <AuthedImage
                  client={client}
                  mxc={profile.avatarMxc}
                  width={80}
                  height={80}
                  className="h-14 w-14 bg-[var(--color-surface)] object-cover"
                  fallback={
                    <span className="flex h-14 w-14 items-center justify-center bg-[var(--color-surface)] text-lg font-semibold uppercase tracking-wide text-[var(--color-text-strong)]">
                      {initialOf(profile.displayName)}
                    </span>
                  }
                />
                {presence && (
                  <span
                    aria-label={presence.label}
                    title={presence.label}
                    className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-[var(--color-panel)] ${presence.color}`}
                  />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-[var(--color-text-strong)]">
                  {profile.displayName}
                </div>
                <div className="mt-0.5 truncate font-mono text-[11px] text-[var(--color-text-muted)]">
                  {target.userId}
                </div>
                {profile.presenceMsg && (
                  <div className="mt-1 line-clamp-2 text-[11px] text-[var(--color-text-muted)]">
                    {profile.presenceMsg}
                  </div>
                )}
              </div>
            </div>

            <dl className="divide-y divide-[var(--color-divider)] text-[11px]">
              {homeServer && (
                <Row label="Home Server" value={homeServer} mono />
              )}
              {presence && (
                <Row
                  label="Status"
                  value={lastActive ?? presence.label}
                />
              )}
              {membership && <Row label="Membership" value={membership} />}
              {profile.powerLevel !== undefined && (
                <Row
                  label="Power Level"
                  value={
                    profile.roleName
                      ? `${profile.roleName} (${profile.powerLevel})`
                      : String(profile.powerLevel)
                  }
                />
              )}
            </dl>
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <dt className="font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
        {label}
      </dt>
      <dd
        className={`min-w-0 truncate text-right text-[var(--color-text-strong)] ${
          mono ? 'font-mono' : 'tabular-nums'
        }`}
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}

function initialOf(name: string): string {
  return name.replace(/^[@#]/, '').charAt(0).toUpperCase() || '?';
}

function homeServerOf(userId: string): string {
  const idx = userId.indexOf(':');
  return idx >= 0 ? userId.slice(idx + 1) : '';
}

function readPowerLevelTags(room: {
  currentState: { getStateEvents: (type: string, key: string) => unknown };
}): PowerLevelTags | null {
  const event = room.currentState.getStateEvents(POWER_LEVEL_TAGS_EVENT, '') as
    | { getContent<T>(): T }
    | null
    | undefined;
  const content = event?.getContent<PowerLevelTags>();
  if (!content) return null;
  const named: PowerLevelTags = {};
  for (const [k, v] of Object.entries(content)) {
    if (v && typeof v.name === 'string' && v.name.trim()) named[k] = v;
  }
  return Object.keys(named).length > 0 ? named : null;
}

function findRoleName(
  powerLevel: number | undefined,
  tags: PowerLevelTags | null,
): string | undefined {
  if (powerLevel === undefined || !tags) return undefined;
  const thresholds = Object.keys(tags)
    .map((k) => Number(k))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => b - a);
  const matched = thresholds.find((t) => powerLevel >= t);
  if (matched === undefined) return undefined;
  return tags[String(matched)]?.name ?? undefined;
}

function presenceLabel(p?: string): { label: string; color: string } | null {
  switch (p) {
    case 'online':
      return { label: 'Online', color: 'bg-emerald-500' };
    case 'unavailable':
      return { label: 'Idle', color: 'bg-amber-500' };
    case 'offline':
      return { label: 'Offline', color: 'bg-zinc-500' };
    default:
      return null;
  }
}

function membershipLabel(m?: string): string | undefined {
  switch (m) {
    case 'join':
      return 'Member';
    case 'invite':
      return 'Invited';
    case 'leave':
      return 'Left';
    case 'ban':
      return 'Banned';
    case 'knock':
      return 'Knocked';
    default:
      return undefined;
  }
}

function formatLastActive(
  lastActiveAgo: number | undefined,
  currentlyActive: boolean | undefined,
  presence: string | undefined,
): string | undefined {
  if (presence === 'online' && currentlyActive) return 'Active now';
  if (presence === 'online' && lastActiveAgo === undefined) return 'Online';
  if (lastActiveAgo === undefined || !Number.isFinite(lastActiveAgo)) {
    return undefined;
  }
  const seconds = Math.floor(lastActiveAgo / 1000);
  if (seconds < 60) return 'Active just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `Active ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Active ${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `Active ${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `Active ${months}mo ago`;
  return undefined;
}
