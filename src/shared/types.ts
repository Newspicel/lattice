export interface AccountMetadata {
  id: string;
  userId: string;
  homeserverUrl: string;
  deviceId: string;
  displayName?: string;
  avatarUrl?: string;
  createdAt: number;
}

export interface NotificationPayload {
  accountId: string;
  roomId: string;
  eventId: string;
  title: string;
  body: string;
  iconDataUrl?: string;
}
