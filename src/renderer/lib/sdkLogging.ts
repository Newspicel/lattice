/**
 * Quiet down well-known SDK noise that isn't actionable from the user's
 * perspective. This must run before any matrix-js-sdk client is constructed.
 *
 * Two sources of noise:
 *   1. `matrix-sdk-crypto-wasm` emits WARN-level tracing for every event we
 *      can't decrypt (missing megolm key, message index < first known, etc.)
 *      and every megolm key we drop because we already have a better version.
 *      The UI already shows `[unable to decrypt]` for these, and the rest are
 *      pure book-keeping.
 *   2. `matrix-js-sdk` re-emits each decryption failure via its own logger
 *      ("Error decrypting event ..."). Same UTD events, double the spam.
 */
import { Tracing, LoggerLevel } from '@matrix-org/matrix-sdk-crypto-wasm';
import { logger as matrixLogger } from 'matrix-js-sdk/lib/logger';

const SUPPRESSED_SDK_WARN_PATTERNS: RegExp[] = [
  // event.ts logs `Error decrypting event (...): DecryptionError[...]` at warn
  // for every UTD it sees. The same condition is already represented in the
  // UI; the log line just spams the console as you scroll history.
  /^Error decrypting event \(/,
];

interface TracingHolder {
  __latticeCryptoTracing?: Tracing;
}

let initialized = false;

export function installSdkLogging(): void {
  if (initialized) return;
  initialized = true;

  try {
    // Stash on globalThis so the wasm-bindgen wrapper isn't GC-finalized
    // (which would `free()` the subscriber and let the default re-take over).
    (globalThis as TracingHolder).__latticeCryptoTracing = new Tracing(LoggerLevel.Error);
  } catch {
    // A tracing subscriber is already installed (e.g. HMR re-import). The
    // existing one stays in effect — that's fine for our purposes.
  }

  patchMatrixLoggerWarn();
}

function patchMatrixLoggerWarn(): void {
  // The runtime impl reads `this.prefix`, even though the public `BaseLogger`
  // type declares `this: void` — invoke it via .call so prefix lookup works.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const original = matrixLogger.warn as (this: unknown, ...args: any[]) => void;
  matrixLogger.warn = function patchedWarn(this: unknown, ...args: unknown[]) {
    const head = typeof args[0] === 'string' ? args[0] : '';
    if (SUPPRESSED_SDK_WARN_PATTERNS.some((p) => p.test(head))) return;
    original.apply(this ?? matrixLogger, args);
  };
}
