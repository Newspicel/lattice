import type { MatrixClient } from 'matrix-js-sdk';

// Full join logic is implemented in M6 (lifecycle.ts). This entry point is
// stable so higher layers can call startCall() from now on.
export async function joinRtcCall(
  _client: MatrixClient,
  _accountId: string,
  _roomId: string,
): Promise<void> {
  const { joinCallInternal } = await import('./lifecycle');
  await joinCallInternal(_client, _accountId, _roomId);
}
