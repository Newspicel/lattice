import { useEffect, useState } from 'react';
import type { MatrixClient } from 'matrix-js-sdk';
import { toast } from 'sonner';
import { Button } from '@/ui/primitives/button';
import { verifyOwnDevice, type SasHandle } from '@/matrix/verification';
import { SettingsPanel, SettingsSection } from './SettingsPrimitives';

interface Device {
  id: string;
  displayName?: string;
  lastSeenTs?: number;
  lastSeenIp?: string;
}

export function DevicesPanel({
  client,
  onSasStart,
}: {
  client: MatrixClient | null;
  onSasStart: (handle: SasHandle) => void;
}) {
  const [devices, setDevices] = useState<Device[]>([]);

  useEffect(() => {
    if (!client) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await client.getDevices();
        if (cancelled) return;
        setDevices(
          res.devices.map((d) => ({
            id: d.device_id,
            displayName: d.display_name,
            lastSeenTs: d.last_seen_ts,
            lastSeenIp: d.last_seen_ip,
          })),
        );
      } catch (err) {
        console.error(err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client]);

  async function onVerify(deviceId: string) {
    if (!client) return;
    try {
      const handle = await verifyOwnDevice(client, deviceId);
      onSasStart(handle);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <SettingsPanel title="Devices">
      <SettingsSection label="Signed-in sessions">
        <ul className="divide-y divide-[var(--color-divider)] border border-[var(--color-divider)] bg-[var(--color-panel-2)]">
          {devices.length === 0 && (
            <li className="px-3 py-3 text-sm text-[var(--color-text-muted)]">No devices found.</li>
          )}
          {devices.map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between px-3 py-2 text-sm"
            >
              <div>
                <div className="font-medium text-[var(--color-text-strong)]">
                  {d.displayName || d.id}
                </div>
                <div className="font-mono text-xs text-[var(--color-text-faint)]">
                  {d.id}
                  {d.lastSeenTs ? ` · ${new Date(d.lastSeenTs).toLocaleString()}` : ''}
                </div>
              </div>
              {d.id !== client?.getDeviceId() && (
                <Button
                  type="button"
                  variant="secondary"
                  size="xs"
                  onClick={() => onVerify(d.id)}
                >
                  Verify
                </Button>
              )}
            </li>
          ))}
        </ul>
      </SettingsSection>
    </SettingsPanel>
  );
}
