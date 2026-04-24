import { X } from 'lucide-react';
import { LoginView } from './LoginView';

/**
 * "Add another account" modal — same login form as the empty-state LoginView,
 * shown over the main shell when the user clicks the "+" button in the rail.
 */
export function LoginAnotherDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60">
      <div className="relative">
        <button
          type="button"
          onClick={onClose}
          className="absolute -top-8 right-0 rounded p-1 text-neutral-400 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
        <LoginView />
      </div>
    </div>
  );
}
