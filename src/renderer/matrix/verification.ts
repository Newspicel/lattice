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
 * Ensure cross-signing + secret storage are set up. No-op if already ready.
 * Note: bootstrapSecretStorage may need interactive auth the first time, so
 * the caller has to be ready to handle the UIA callback.
 */
export async function ensureCryptoBootstrapped(client: MatrixClient): Promise<void> {
  const crypto = client.getCrypto();
  if (!crypto) throw new Error('Crypto not initialised');

  if (!(await crypto.isCrossSigningReady())) {
    await crypto.bootstrapCrossSigning({
      authUploadDeviceSigningKeys: async () => {
        /* UIA handled externally */
      },
    });
  }
  if (!(await crypto.isSecretStorageReady())) {
    await crypto.bootstrapSecretStorage({
      setupNewKeyBackup: true,
    });
  }
}
