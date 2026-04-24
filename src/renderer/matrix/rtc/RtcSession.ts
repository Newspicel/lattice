import type { MatrixClient } from 'matrix-js-sdk';

/**
 * Entry point for starting a MatrixRTC call. Full implementation lives in
 * this module; the details of session join + LiveKit connect + E2EE key
 * distribution are built out in M6.
 */
export async function startCall(
  _client: MatrixClient,
  _accountId: string,
  _roomId: string,
): Promise<void> {
  const { joinRtcCall } = await import('./join');
  return joinRtcCall(_client, _accountId, _roomId);
}
