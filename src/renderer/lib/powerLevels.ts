import type { MatrixClient } from 'matrix-js-sdk';

export interface SpacePermissions {
  canInvite: boolean;
  canManageChildren: boolean;
  canEditProfile: boolean;
}

const NO_PERMS: SpacePermissions = {
  canInvite: false,
  canManageChildren: false,
  canEditProfile: false,
};

export function getSpacePermissions(
  client: MatrixClient,
  roomId: string,
): SpacePermissions {
  const room = client.getRoom(roomId);
  const userId = client.getUserId();
  if (!room || !userId) return NO_PERMS;
  const state = room.currentState;
  return {
    canInvite: room.canInvite(userId),
    canManageChildren: state.maySendStateEvent('m.space.child', userId),
    canEditProfile:
      state.maySendStateEvent('m.room.name', userId) ||
      state.maySendStateEvent('m.room.topic', userId) ||
      state.maySendStateEvent('m.room.avatar', userId),
  };
}
