import type { MatrixClient } from 'matrix-js-sdk';
import { AuthedImage, type EncryptedFile } from '@/lib/mxc';

interface StickerContent {
  body?: string;
  url?: string;
  file?: EncryptedFile;
  info?: { mimetype?: string; w?: number; h?: number };
}

/**
 * Renders an `m.sticker` event. MSC1951 keeps the same shape as `m.image`
 * (url + info) but stickers render without a card around them.
 */
export function StickerMessage({
  content,
  client,
  onClick,
}: {
  content: StickerContent;
  client: MatrixClient | null | undefined;
  onClick?: () => void;
}) {
  if (!content.url && !content.file) {
    return (
      <span className="text-sm text-[var(--color-text-muted)]">
        {content.body || '[sticker]'}
      </span>
    );
  }
  const targetW = Math.min(content.info?.w ?? 160, 200);
  const targetH = Math.min(content.info?.h ?? 160, 200);
  return (
    <button
      type="button"
      onClick={onClick}
      className="block max-w-fit cursor-zoom-in bg-transparent p-0"
      title={content.body || 'sticker'}
    >
      <AuthedImage
        client={client}
        mxc={content.file ? null : content.url}
        file={content.file ?? null}
        mimetype={content.info?.mimetype}
        width={targetW * 2}
        height={targetH * 2}
        alt={content.body ?? 'sticker'}
        style={{ maxWidth: 200, maxHeight: 200, width: 'auto', height: 'auto' }}
        fallback={
          <span className="text-sm text-[var(--color-text-muted)]">
            {content.body || 'sticker'}
          </span>
        }
      />
    </button>
  );
}
