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
} as const;

export type IpcChannel =
  (typeof IpcChannels)[keyof typeof IpcChannels][keyof (typeof IpcChannels)[keyof typeof IpcChannels]];
