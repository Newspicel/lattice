import type { MatrixClient } from 'matrix-js-sdk';
import type {
  ShowSasCallbacks,
  Verifier,
  VerificationRequest,
} from 'matrix-js-sdk/lib/crypto-api/verification';
import {
  VerificationPhase,
  VerificationRequestEvent,
  VerifierEvent,
} from 'matrix-js-sdk/lib/crypto-api/verification';
import { decodeRecoveryKey } from 'matrix-js-sdk/lib/crypto-api/recovery-key';
import { cacheRecoveryKey, createSecretStorageKey } from './secretStorage';

export interface SasHandle {
  emoji: [string, string][];
  accept: () => Promise<void>;
  cancel: () => Promise<void>;
  confirm: () => Promise<void>;
  mismatch: () => Promise<void>;
  onDone: Promise<void>;
}

/**
 * Start verifying one of the current user's other devices (fresh login flow).
 * Returns a handle once the SAS emojis are available.
 */
export async function verifyOwnDevice(
  client: MatrixClient,
  deviceId: string,
): Promise<SasHandle> {
  const crypto = client.getCrypto();
  if (!crypto) throw new Error('Crypto not initialised');

  const request = await crypto.requestDeviceVerification(
    client.getUserId() ?? '',
    deviceId,
  );
  return runSasFlow(request);
}

export async function acceptIncomingVerification(
  request: VerificationRequest,
): Promise<SasHandle> {
  if (!request.accepting) {
    await request.accept();
  }
  return runSasFlow(request);
}

async function runSasFlow(request: VerificationRequest): Promise<SasHandle> {
  const verifier = await startSasVerifier(request);

  const sas = await waitForSas(verifier);
  const done = verifier.verify();

  return {
    emoji: sas.sas.emoji?.map((e) => [e[0], e[1]] as [string, string]) ?? [],
    accept: async () => {
      /* accept() happens via request.accept above */
    },
    cancel: async () => {
      await request.cancel();
    },
    confirm: async () => {
      await sas.confirm();
    },
    mismatch: async () => {
      sas.mismatch();
    },
    onDone: done,
  };
}

async function startSasVerifier(request: VerificationRequest): Promise<Verifier> {
  if (request.verifier) return request.verifier;
  return new Promise<Verifier>((resolve, reject) => {
    const onChange = async () => {
      if (request.verifier) {
        cleanup();
        resolve(request.verifier);
      }
      if (request.phase === VerificationPhase.Cancelled) {
        cleanup();
        reject(new Error('Verification cancelled'));
      }
    };
    const cleanup = () => {
      request.off(VerificationRequestEvent.Change, onChange);
    };
    request.on(VerificationRequestEvent.Change, onChange);
    request.startVerification('m.sas.v1').catch(reject);
  });
}

async function waitForSas(verifier: Verifier): Promise<ShowSasCallbacks> {
  const existing = verifier.getShowSasCallbacks();
  if (existing) return existing;
  return new Promise<ShowSasCallbacks>((resolve, reject) => {
    const onShow = (cb: ShowSasCallbacks) => {
      cleanup();
      resolve(cb);
    };
    const onCancel = (e: Error | unknown) => {
      cleanup();
      reject(e instanceof Error ? e : new Error('Verification cancelled'));
    };
    const cleanup = () => {
      verifier.off(VerifierEvent.ShowSas, onShow);
      verifier.off(VerifierEvent.Cancel, onCancel);
    };
    verifier.on(VerifierEvent.ShowSas, onShow);
    verifier.on(VerifierEvent.Cancel, onCancel);
  });
}

/**
 * First-time-setup for a brand-new account: create SSSS + a key backup.
 *
 * Refuses to run if SSSS is already configured on the server — in that case
 * this device must adopt the existing setup via `unlockWithRecoveryKey` or
 * by being verified from another signed-in device (which gossips the keys
 * over automatically). Calling `bootstrapSecretStorage` with
 * `setupNewSecretStorage` in that state would overwrite the default key,
 * breaking history decryption on every other device and the key backup.
 */
export async function ensureCryptoBootstrapped(client: MatrixClient): Promise<void> {
  const crypto = client.getCrypto();
  if (!crypto) throw new Error('Crypto not initialised');

  if (await crypto.isSecretStorageReady()) return;

  // If SSSS is already configured on the server, refuse to run first-time
  // setup *before* touching cross-signing: `bootstrapCrossSigning` would
  // otherwise read the cross-signing secrets from SSSS, invoking
  // `getSecretStorageKey` with no cached key and failing with the opaque
  // "callback returned falsey" error.
  const existingKeyId = await client.secretStorage.getDefaultKeyId();
  if (existingKeyId) {
    throw new Error(
      'Secret storage is already configured on this account. ' +
        'Verify this device from another signed-in session, or enter your recovery key, ' +
        'so this client can adopt the existing backup instead of replacing it.',
    );
  }

  if (!(await crypto.isCrossSigningReady())) {
    await crypto.bootstrapCrossSigning({
      authUploadDeviceSigningKeys: async () => {
        /* UIA handled externally */
      },
    });
  }

  await crypto.bootstrapSecretStorage({
    createSecretStorageKey,
    setupNewKeyBackup: true,
  });
}

/**
 * Adopt an existing SSSS setup using the user's recovery key.
 *
 * Validates the key against the server-side default key info, caches it so
 * the SDK's `getSecretStorageKey` callback can satisfy future requests, then
 * pulls the megolm backup decryption key into the crypto store. Past messages
 * sent before this device logged in can then be restored from key backup.
 */
export async function unlockWithRecoveryKey(
  client: MatrixClient,
  accountId: string,
  recoveryKey: string,
): Promise<void> {
  const crypto = client.getCrypto();
  if (!crypto) throw new Error('Crypto not initialised');

  const trimmed = recoveryKey.trim();
  if (!trimmed) throw new Error('Enter your recovery key.');

  let decoded: Uint8Array;
  try {
    decoded = decodeRecoveryKey(trimmed);
  } catch {
    throw new Error('That does not look like a valid recovery key.');
  }

  const entry = await client.secretStorage.getKey();
  if (!entry) {
    throw new Error('No secret storage is configured on the server for this account.');
  }
  const [keyId, keyInfo] = entry;
  const ok = await client.secretStorage.checkKey(decoded, keyInfo);
  if (!ok) {
    throw new Error('Recovery key did not match. Double-check the characters and try again.');
  }

  cacheRecoveryKey(accountId, keyId, decoded);

  if (!(await crypto.isCrossSigningReady())) {
    await crypto.bootstrapCrossSigning({
      authUploadDeviceSigningKeys: async () => {
        /* UIA handled externally */
      },
    });
  }

  await crypto.loadSessionBackupPrivateKeyFromSecretStorage();
  await crypto.checkKeyBackupAndEnable();
  try {
    await crypto.restoreKeyBackup();
  } catch (err) {
    console.warn('Key backup restore completed with errors', err);
  }
}
