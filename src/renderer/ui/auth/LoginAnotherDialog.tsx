import { LoginView } from './LoginView';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { Button } from '@/ui/primitives/button';
import { X } from 'lucide-react';

/**
 * "Add another account" modal — same login form as the empty-state LoginView,
 * shown over the main shell when the user clicks the "+" button in the rail.
 */
export function LoginAnotherDialog({ onClose }: { onClose: () => void }) {
  return (
    <DialogPrimitive.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-40 bg-[var(--color-backdrop)] data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 transition-opacity duration-150" />
        <DialogPrimitive.Popup
          aria-label="Add another account"
          className="fixed inset-0 z-50 flex items-center justify-center outline-none"
        >
          <div className="relative">
            <DialogPrimitive.Close
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="absolute -top-9 right-0 text-[var(--color-text-muted)] hover:text-[var(--color-text-strong)]"
                  aria-label="Close"
                />
              }
            >
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
            <LoginView onAuthenticated={onClose} />
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
