import { useEffect, useRef, useState } from 'react';

/**
 * Acquires a video stream for a single camera deviceId and attaches it to a
 * <video> element via a returned ref. Releases the stream on unmount or when
 * deviceId/enabled change.
 */
export function useCameraPreview(deviceId: string, enabled: boolean): {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  error: string | null;
} {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let stream: MediaStream | null = null;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: deviceId === 'default' ? undefined : { exact: deviceId },
          },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const el = videoRef.current;
        if (el) {
          el.srcObject = stream;
          el.play().catch(() => { /* user-gesture issues are fine here */ });
        }
        setError(null);
      } catch (err: unknown) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'Camera unavailable';
          setError(msg);
        }
      }
    })();

    const elAtMount = videoRef.current;
    return () => {
      cancelled = true;
      if (stream) stream.getTracks().forEach((t) => t.stop());
      if (elAtMount) elAtMount.srcObject = null;
    };
  }, [deviceId, enabled]);

  return { videoRef, error };
}
