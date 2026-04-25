interface InitialBadgeProps {
  text: string;
  className?: string;
}

export function InitialBadge({ text, className }: InitialBadgeProps) {
  const initial = text.replace(/^@/, '').charAt(0).toUpperCase() || '?';
  return (
    <span
      className={`flex items-center justify-center bg-[var(--color-accent)] font-semibold text-white ${className ?? ''}`}
    >
      {initial}
    </span>
  );
}
