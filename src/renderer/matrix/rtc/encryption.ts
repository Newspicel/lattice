import type { Room as LivekitRoom } from 'livekit-client';
import { BaseKeyProvider } from 'livekit-client';
import type { MatrixRTCSession } from 'matrix-js-sdk/lib/matrixrtc/MatrixRTCSession';
import { MatrixRTCSessionEvent } from 'matrix-js-sdk/lib/matrixrtc/MatrixRTCSession';

/**
 * A KeyProvider driven by Matrix per-participant keys.
 *
 * LiveKit's `ExternalE2EEKeyProvider` only supports a single shared secret.
 * Matrix distributes a fresh key per participant and rotates on membership
 * change, so we subclass `BaseKeyProvider` to expose the protected key-setter
 * for arbitrary `participantIdentity`.
 *
 * `participantIdentity` for Matrix uses the form `"@user:server/DEVICEID"`,
 * matching what lk-jwt-service encodes into the LiveKit JWT.
 */
export class MatrixKeyProvider extends BaseKeyProvider {
  async setParticipantKey(
    rawKey: Uint8Array,
    participantIdentity: string,
    keyIndex: number,
  ): Promise<void> {
    const buffer = rawKey.buffer.slice(
      rawKey.byteOffset,
      rawKey.byteOffset + rawKey.byteLength,
    ) as ArrayBuffer;
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      buffer,
      { name: 'HKDF' },
      false,
      ['deriveBits', 'deriveKey'],
    );
    // onSetEncryptionKey is protected on BaseKeyProvider; subclassing is the
    // canonical way to feed keys into the LiveKit E2EE manager.
    this.onSetEncryptionKey(cryptoKey, participantIdentity, keyIndex);
  }
}

function identityFor(membership: { userId?: string; deviceId?: string }): string {
  return `${membership.userId ?? ''}:${membership.deviceId ?? ''}`;
}

/**
 * Forward every new key that MatrixRTCSession distributes into the LiveKit
 * E2EE manager under the owning participant's identity.
 */
export function bridgeMatrixKeysIntoLivekit(
  session: MatrixRTCSession,
  _lkRoom: LivekitRoom,
  keyProvider: MatrixKeyProvider,
): () => void {
  const onKey = (
    key: Uint8Array,
    keyIndex: number,
    membership: { userId?: string; deviceId?: string } & Record<string, unknown>,
  ) => {
    void keyProvider.setParticipantKey(key, identityFor(membership), keyIndex);
  };

  session.on(MatrixRTCSessionEvent.EncryptionKeyChanged, onKey);
  return () => {
    session.off(MatrixRTCSessionEvent.EncryptionKeyChanged, onKey);
  };
}
