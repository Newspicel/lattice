import { useEffect, useRef, useState } from 'react';
import type { MatrixClient } from 'matrix-js-sdk';
import { useAccountsStore } from '@/state/accounts';
import { accountManager } from '@/matrix/AccountManager';

interface WidgetStateContent {
  type?: string;
  url?: string;
  name?: string;
  data?: Record<string, unknown>;
  creatorUserId?: string;
}

interface RoomWidget {
  stateKey: string;
  name: string;
  url: string;
  type: string;
}

function readWidgets(client: MatrixClient, roomId: string): RoomWidget[] {
  const room = client.getRoom(roomId);
  if (!room) return [];
  const out: RoomWidget[] = [];
  for (const kind of ['m.widget', 'im.vector.modular.widgets'] as const) {
    const events = room.currentState.getStateEvents(kind);
    for (const e of events) {
      const content = e.getContent<WidgetStateContent>();
      if (!content.url) continue;
      const stateKey = e.getStateKey();
      if (!stateKey) continue;
      out.push({
        stateKey,
        name: content.name ?? stateKey,
        url: content.url,
        type: content.type ?? 'custom',
      });
    }
  }
  return out;
}

export function WidgetFrame({ roomId }: { roomId: string }) {
  const activeAccountId = useAccountsStore((s) => s.activeAccountId);
  const client = activeAccountId ? (accountManager.getClient(activeAccountId) ?? null) : null;
  const [widgets, setWidgets] = useState<RoomWidget[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!client) return;
    setWidgets(readWidgets(client, roomId));
  }, [client, roomId]);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (!iframeRef.current) return;
      if (e.source !== iframeRef.current.contentWindow) return;
      handleWidgetMessage(e, iframeRef.current);
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  if (widgets.length === 0) {
    return <div className="p-4 text-sm text-neutral-500">No widgets in this room.</div>;
  }
  const activeWidget = widgets.find((w) => w.stateKey === active) ?? widgets[0];

  return (
    <div className="flex h-full flex-col">
      <div className="flex gap-1 border-b border-[var(--color-divider)] px-2 py-1 text-xs">
        {widgets.map((w) => (
          <button
            key={w.stateKey}
            type="button"
            onClick={() => setActive(w.stateKey)}
            className={`rounded px-2 py-1 ${activeWidget.stateKey === w.stateKey ? 'bg-[var(--color-accent)] text-white' : 'text-neutral-300 hover:bg-white/10'}`}
          >
            {w.name}
          </button>
        ))}
      </div>
      <iframe
        ref={iframeRef}
        title={activeWidget.name}
        src={activeWidget.url}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        className="flex-1 border-0"
      />
    </div>
  );
}

/**
 * Minimal widget API responder (MSC2764 subset).
 * The real implementation needs capability negotiation and scoped send/read
 * event handlers. This is enough to let a simple widget bootstrap.
 */
function handleWidgetMessage(e: MessageEvent, frame: HTMLIFrameElement): void {
  const data = e.data as { api?: string; action?: string; requestId?: string };
  if (data?.api !== 'fromWidget') return;
  // Echo back an empty response so the widget's SDK doesn't stall.
  const reply = { ...data, api: 'toWidget', response: {} };
  frame.contentWindow?.postMessage(reply, '*');
}
