import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { EncryptedFile } from '@/lib/mxc';
import { AuthedImage } from '@/lib/mxc';
import { useAccountsStore } from '@/state/accounts';
import { accountManager } from '@/matrix/AccountManager';
import { useUiStore } from '@/state/ui';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';

const MIN_ZOOM = 1;
const MAX_ZOOM = 8;
const ZOOM_STEP = 1.2;
// Pixels of pointer movement before we treat a press-drag as a pan rather
// than a click. Without this, releasing the mouse after a tiny jitter would
// be read as "clicked next to the image" and close the lightbox.
const DRAG_THRESHOLD = 4;

export function ImageLightbox() {
  const lightbox = useUiStore((s) => s.lightbox);
  const close = useUiStore((s) => s.closeLightbox);
  const activeAccountId = useAccountsStore((s) => s.activeAccountId);
  const client = activeAccountId ? accountManager.getClient(activeAccountId) : null;

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{
    startX: number;
    startY: number;
    panX: number;
    panY: number;
    moved: boolean;
    startedOnImage: boolean;
  } | null>(null);

  // Whenever a new image opens, start fresh — leftover zoom/pan from the
  // previous image would otherwise carry over.
  useEffect(() => {
    if (lightbox) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
    }
  }, [lightbox]);

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
    setZoom((z) => {
      const next = clamp(z * factor, MIN_ZOOM, MAX_ZOOM);
      if (next <= MIN_ZOOM) setPan({ x: 0, y: 0 });
      return next;
    });
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const target = e.target as Element;
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      panX: pan.x,
      panY: pan.y,
      moved: false,
      startedOnImage: target.tagName === 'IMG',
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    drag.moved = true;
    if (zoom > 1) setPan({ x: drag.panX + dx, y: drag.panY + dy });
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // Capture may already have been released — ignore.
    }
    if (!drag || drag.moved) return;
    if (drag.startedOnImage) {
      // Tap on the image toggles between fit and a 2x zoom.
      setZoom((z) => (z > 1 ? 1 : 2));
      setPan({ x: 0, y: 0 });
      return;
    }
    // Click landed on the backdrop area next to the image.
    close();
  };

  const cursor = zoom > 1 ? 'grab' : 'zoom-in';

  return (
    <DialogPrimitive.Root
      open={!!lightbox}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-[var(--color-backdrop-strong)] data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 transition-opacity duration-150" />
        <DialogPrimitive.Popup
          aria-label={lightbox?.alt ?? 'Image preview'}
          className="fixed inset-0 z-50 outline-none"
        >
          <div
            className="absolute inset-0 flex select-none items-center justify-center overflow-hidden"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onWheel={onWheel}
            style={{ cursor }}
          >
            {lightbox && (
              <AuthedImage
                client={client}
                mxc={lightbox.mxc ?? null}
                file={(lightbox.file as EncryptedFile | null) ?? null}
                mimetype={lightbox.mimetype}
                alt={lightbox.alt ?? ''}
                onDragStart={(e) => e.preventDefault()}
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                  transition: dragRef.current ? 'none' : 'transform 150ms ease-out',
                }}
                className="max-h-[90vh] max-w-[90vw] object-contain"
                fallback={
                  <span className="text-sm text-[var(--color-text-muted)]">loading…</span>
                }
              />
            )}
          </div>

          <DialogPrimitive.Close
            aria-label="Close"
            className="fixed right-4 top-4 z-[60] flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white outline-none transition-colors hover:bg-black/60 focus-visible:ring-2 focus-visible:ring-white/60"
          >
            <X className="h-5 w-5" />
          </DialogPrimitive.Close>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
