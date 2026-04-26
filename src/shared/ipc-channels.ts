export const IpcChannels = {
  Secrets: {
    Get: 'secrets:get',
    Set: 'secrets:set',
    Delete: 'secrets:delete',
  },
  Accounts: {
    ListMetadata: 'accounts:list-metadata',
    UpsertMetadata: 'accounts:upsert-metadata',
    DeleteMetadata: 'accounts:delete-metadata',
  },
  DeepLink: {
    SsoCallback: 'deep-link:sso-callback',
  },
  Notifications: {
    Show: 'notifications:show',
    Clicked: 'notifications:clicked',
  },
  Window: {
    Focus: 'window:focus',
    SetBadgeCount: 'window:set-badge-count',
  },
  Updates: {
    GetState: 'updates:get-state',
    GetChannel: 'updates:get-channel',
    SetChannel: 'updates:set-channel',
    Check: 'updates:check',
    QuitAndInstall: 'updates:quit-and-install',
    StateChanged: 'updates:state-changed',
  },
} as const;

export type IpcChannel =
  (typeof IpcChannels)[keyof typeof IpcChannels][keyof (typeof IpcChannels)[keyof typeof IpcChannels]];
