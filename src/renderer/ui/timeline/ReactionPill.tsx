import type { MatrixClient } from 'matrix-js-sdk';
import { EmoteImage } from './EmoteImage';

interface ReactionPillProps {
  client: MatrixClient | null | undefined;
  reactionKey: string;
  count: number;
  byMe: boolean;
  /** Optional shortcode lookup for nicer tooltips on mxc-keyed reactions. */
  resolveTooltip?: (key: string) => string | null;
  onClick: () => void;
}

/**
 * Renders a single reaction badge. If the reaction key looks like an mxc URL
 * (MSC2545 custom emoji reaction), render the inline image; otherwise render
 * the literal text glyph.
 */
export function ReactionPill({
  client,
  reactionKey,
  count,
  byMe,
  resolveTooltip,
  onClick,
}: ReactionPillProps) {
  const isCustom = reactionKey.startsWith('mxc://');
  const tooltip = resolveTooltip?.(reactionKey) ?? (isCustom ? 'custom' : reactionKey);
  return (
    <button
      type="button"
      onClick={onClick}
      title={tooltip}
      className={`flex items-center gap-1 border px-1.5 py-0.5 text-xs tabular-nums transition-colors ${
        byMe
          ? 'border-[var(--color-text-strong)] bg-[var(--color-surface)] text-[var(--color-text-strong)]'
          : 'border-[var(--color-divider)] bg-[var(--color-panel-2)] text-[var(--color-text-muted)] hover:bg-[var(--color-hover-overlay)]'
      }`}
    >
      {isCustom ? (
        <EmoteImage client={client} mxc={reactionKey} alt={tooltip} size={18} />
      ) : (
        <span>{reactionKey}</span>
      )}
      <span className="font-mono text-[10px]">{count}</span>
    </button>
  );
}
