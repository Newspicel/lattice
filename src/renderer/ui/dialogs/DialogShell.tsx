import type { ReactNode } from 'react';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { X } from 'lucide-react';
import { Button } from '@/ui/primitives/button';

export function DialogShell({
  open,
  onClose,
  title,
  description,
  children,
  width = 480,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  width?: number;
}) {
  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-40 bg-[var(--color-backdrop)] data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 transition-opacity duration-150" />
        <DialogPrimitive.Popup
          aria-label={title}
          style={{ width }}
          className="fixed left-1/2 top-1/2 z-50 max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 border border-[var(--color-divider)] bg-[var(--color-panel)] outline-none data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 transition-opacity duration-150"
        >
          <header className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--color-divider)] px-4">
            <DialogPrimitive.Title className="truncate text-sm font-semibold uppercase tracking-wider text-[var(--color-text-strong)]">
              {title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              render={<Button variant="ghost" size="icon-sm" aria-label="Close" />}
            >
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </header>
          {description && (
            <DialogPrimitive.Description className="border-b border-[var(--color-divider)] px-4 py-2 text-xs text-[var(--color-text-muted)]">
              {description}
            </DialogPrimitive.Description>
          )}
          <div className="px-4 py-4">{children}</div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function DialogField({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm" htmlFor={htmlFor}>
      <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
        {label}
      </span>
      {children}
      {hint && <span className="text-xs text-[var(--color-text-faint)]">{hint}</span>}
    </label>
  );
}

export function DialogActions({ children }: { children: ReactNode }) {
  return (
    <div className="mt-5 flex justify-end gap-2 border-t border-[var(--color-divider)] -mx-4 -mb-4 px-4 py-3 bg-[var(--color-panel-2)]">
      {children}
    </div>
  );
}
