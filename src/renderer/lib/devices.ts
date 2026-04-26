import { useEffect, useState } from 'react';

export type DeviceKind = 'audioinput' | 'audiooutput' | 'videoinput';

export interface DeviceOption {
  deviceId: string;
  label: string;
}

interface DeviceSet {
  audioinput: DeviceOption[];
  audiooutput: DeviceOption[];
  videoinput: DeviceOption[];
  permissionGranted: boolean;
}

const EMPTY_SET: DeviceSet = {
  audioinput: [],
  audiooutput: [],
  videoinput: [],
  permissionGranted: false,
};

async function enumerate(): Promise<DeviceSet> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
    return EMPTY_SET;
  }
  const list = await navigator.mediaDevices.enumerateDevices();
  // Devices have empty labels until media permission has been granted at least
  // once. Treat any non-empty label as proof of permission.
  const permissionGranted = list.some((d) => !!d.label);
  const groups: DeviceSet = {
    audioinput: [],
    audiooutput: [],
    videoinput: [],
    permissionGranted,
  };
  for (const d of list) {
    if (d.kind === 'audioinput' || d.kind === 'audiooutput' || d.kind === 'videoinput') {
      groups[d.kind].push({
        deviceId: d.deviceId,
        label: d.label || fallbackLabel(d.kind, groups[d.kind].length),
      });
    }
  }
  return groups;
}

function fallbackLabel(kind: DeviceKind, idx: number): string {
  const base =
    kind === 'audioinput'
      ? 'Microphone'
      : kind === 'audiooutput'
        ? 'Speaker'
        : 'Camera';
  return idx === 0 ? base : `${base} ${idx + 1}`;
}

/**
 * Live list of media devices. Re-enumerates whenever the OS reports a change.
 */
export function useMediaDevices(): DeviceSet {
  const [set, setSet] = useState<DeviceSet>(EMPTY_SET);

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      const next = await enumerate();
      if (!cancelled) setSet(next);
    }
    void refresh();
    const onChange = () => void refresh();
    navigator.mediaDevices?.addEventListener('devicechange', onChange);
    return () => {
      cancelled = true;
      navigator.mediaDevices?.removeEventListener('devicechange', onChange);
    };
  }, []);

  return set;
}

/**
 * One-shot getUserMedia to coax the OS permission prompt; the granted stream
 * is stopped immediately. Triggers a `devicechange` notification on most
 * platforms which causes labels to populate.
 */
export async function requestMediaPermission(
  kind: 'audio' | 'video' | 'both',
): Promise<boolean> {
  const constraints: MediaStreamConstraints =
    kind === 'audio'
      ? { audio: true }
      : kind === 'video'
        ? { video: true }
        : { audio: true, video: true };
  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    for (const t of stream.getTracks()) t.stop();
    return true;
  } catch {
    return false;
  }
}
