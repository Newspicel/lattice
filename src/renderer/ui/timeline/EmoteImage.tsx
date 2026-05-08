import type { MatrixClient } from 'matrix-js-sdk';
import { useAuthedMedia } from '@/lib/mxc';

interface EmoteImageProps {
  client: MatrixClient | null | undefined;
  mxc: string;
  alt: string;
  size?: number;
}

/**
 * Inline authenticated emoticon image. Renders the literal `:alt:` text while
 * loading or on error so the message is still readable.
 */
export function EmoteImage({ client, mxc, alt, size = 22 }: EmoteImageProps) {
  const url = useAuthedMedia(client, mxc, size * 2, size * 2);
  if (!url) {
    return (
      <span className="font-mono text-xs text-[var(--color-text-muted)]">{alt}</span>
    );
  }
  return (
    <img
      src={url}
      alt={alt}
      title={alt}
      draggable={false}
      className="inline-block align-text-bottom"
      style={{ height: size, width: 'auto' }}
    />
  );
}
