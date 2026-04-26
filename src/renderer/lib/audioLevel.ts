import { useEffect, useRef, useState } from 'react';

interface AudioLevelOptions {
  deviceId: string;
  enabled: boolean;
  noiseSuppression: boolean;
  echoCancellation: boolean;
  autoGainControl: boolean;
}

/**
 * Measures the RMS level of a microphone stream and returns a value in [0,1].
 * The hook lazily acquires the stream when `enabled` is true and releases it
 * when disabled or unmounted, so it's safe to use as a settings preview.
 */
export function useMicLevel(opts: AudioLevelOptions): {
  level: number;
  error: string | null;
} {
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!opts.enabled) {
      setLevel(0);
      return;
    }
    let cancelled = false;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    let analyser: AnalyserNode | null = null;
    let buffer: Float32Array<ArrayBuffer> | null = null;

    (async () => {
      try {
        const constraints: MediaTrackConstraints = {
          deviceId: opts.deviceId === 'default' ? undefined : { exact: opts.deviceId },
          noiseSuppression: opts.noiseSuppression,
          echoCancellation: opts.echoCancellation,
          autoGainControl: opts.autoGainControl,
        };
        stream = await navigator.mediaDevices.getUserMedia({ audio: constraints });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const AudioCtx = window.AudioContext;
        ctx = new AudioCtx();
        source = ctx.createMediaStreamSource(stream);
        analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.4;
        source.connect(analyser);
        buffer = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));

        const tick = () => {
          if (cancelled || !analyser || !buffer) return;
          analyser.getFloatTimeDomainData(buffer);
          let sum = 0;
          for (let i = 0; i < buffer.length; i++) {
            sum += buffer[i] * buffer[i];
          }
          const rms = Math.sqrt(sum / buffer.length);
          // Map RMS (~0..0.5) to a perceptual 0..1 with a soft knee.
          const mapped = Math.min(1, Math.max(0, rms * 4));
          setLevel(mapped);
          rafRef.current = requestAnimationFrame(tick);
        };
        tick();
      } catch (err: unknown) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'Microphone unavailable';
          setError(msg);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      if (source) try { source.disconnect(); } catch { /* noop */ }
      if (analyser) try { analyser.disconnect(); } catch { /* noop */ }
      if (ctx) void ctx.close();
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, [
    opts.enabled,
    opts.deviceId,
    opts.noiseSuppression,
    opts.echoCancellation,
    opts.autoGainControl,
  ]);

  return { level, error };
}
