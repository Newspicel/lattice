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

export type UpdateChannel = 'stable' | 'nightly';

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'up-to-date'
  | 'error'
  | 'unsupported';

export interface UpdateProgress {
  percent: number;
  transferred: number;
  total: number;
  bytesPerSecond: number;
}

export interface UpdateState {
  status: UpdateStatus;
  channel: UpdateChannel;
  version: string;
  availableVersion?: string;
  progress?: UpdateProgress;
  error?: string;
}
