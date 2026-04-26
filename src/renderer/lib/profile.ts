import { useEffect, useState } from 'react';
import { UserEvent, type MatrixClient, type User } from 'matrix-js-sdk';

export interface OwnProfile {
  displayName: string | null;
  avatarMxc: string | null;
}

function readProfile(client: MatrixClient, userId: string): OwnProfile {
  const user = client.getUser(userId);
  return {
    displayName: user?.displayName ?? null,
    avatarMxc: user?.avatarUrl ?? null,
  };
}

export function useOwnProfile(client: MatrixClient | null, userId: string): OwnProfile {
  const [profile, setProfile] = useState<OwnProfile>({
    displayName: null,
    avatarMxc: null,
  });

  useEffect(() => {
    if (!client || !userId) {
      setProfile({ displayName: null, avatarMxc: null });
      return;
    }

    setProfile(readProfile(client, userId));

    let cancelled = false;
    if (!client.getUser(userId)?.avatarUrl) {
      client
        .getProfileInfo(userId)
        .then((info) => {
          if (cancelled) return;
          setProfile((prev) => ({
            displayName: info?.displayname ?? prev.displayName,
            avatarMxc: info?.avatar_url ?? prev.avatarMxc,
          }));
        })
        .catch(() => {});
    }

    const onChange = (_event: unknown, user: User) => {
      if (user.userId !== userId) return;
      setProfile(readProfile(client, userId));
    };
    client.on(UserEvent.DisplayName, onChange);
    client.on(UserEvent.AvatarUrl, onChange);
    return () => {
      cancelled = true;
      client.off(UserEvent.DisplayName, onChange);
      client.off(UserEvent.AvatarUrl, onChange);
    };
  }, [client, userId]);

  return profile;
}
