import { useEffect, useMemo, useRef, useState } from 'react';
import { Popover as PopoverPrimitive } from '@base-ui/react/popover';
import { Search, Sticker as StickerIcon } from 'lucide-react';
import type { MatrixClient } from 'matrix-js-sdk';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/primitives/tooltip';
import type { CustomEmoji } from '@/matrix/customEmojis';
import { AuthedImage } from '@/lib/mxc';

interface StickerPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stickers: CustomEmoji[];
  client: MatrixClient | null | undefined;
  onSelect: (sticker: CustomEmoji) => void | Promise<void>;
  disabled?: boolean;
}

interface StickerSection {
  id: string;
  label: string;
  items: CustomEmoji[];
}

function groupStickers(stickers: CustomEmoji[]): StickerSection[] {
  const sections = new Map<string, StickerSection>();
  for (const s of stickers) {
    const id =
      s.source.kind === 'user'
        ? 'user'
        : `room:${s.source.roomId}:${s.source.stateKey}`;
    const label = s.source.kind === 'user' ? 'My stickers' : 'Room stickers';
    let bucket = sections.get(id);
    if (!bucket) {
      bucket = { id, label, items: [] };
      sections.set(id, bucket);
    }
    bucket.items.push(s);
  }
  return Array.from(sections.values());
}

export function StickerPicker({
  open,
  onOpenChange,
  stickers,
  client,
  onSelect,
  disabled,
}: StickerPickerProps) {
  return (
    <PopoverPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverPrimitive.Trigger
              render={
                <button
                  type="button"
                  disabled={disabled}
                  aria-label="Send sticker"
                  className={`mb-0.5 flex h-7 w-7 shrink-0 items-center justify-center text-[var(--color-text-muted)] transition-colors aria-expanded:bg-[var(--color-hover-overlay)] aria-expanded:text-[var(--color-text-strong)] ${
                    disabled
                      ? 'cursor-not-allowed'
                      : 'hover:bg-[var(--color-hover-overlay)] hover:text-[var(--color-text-strong)]'
                  }`}
                />
              }
            />
          }
        >
          <StickerIcon className="h-4 w-4" strokeWidth={1.75} />
        </TooltipTrigger>
        <TooltipContent>Send sticker</TooltipContent>
      </Tooltip>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner align="end" side="top" sideOffset={6} className="isolate z-50">
          <PopoverPrimitive.Popup
            className="flex h-[360px] w-[340px] flex-col overflow-hidden border border-[var(--color-divider)] bg-[var(--color-panel-2)] text-[var(--color-text)] outline-none data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 transition-opacity duration-100"
            aria-label="Sticker picker"
          >
            <StickerPickerBody stickers={stickers} client={client} onSelect={onSelect} />
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

function StickerPickerBody({
  stickers,
  client,
  onSelect,
}: {
  stickers: CustomEmoji[];
  client: MatrixClient | null | undefined;
  onSelect: (sticker: CustomEmoji) => void | Promise<void>;
}) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);

  const sections = useMemo(() => groupStickers(stickers), [stickers]);
  const isSearching = query.trim().length > 0;

  const filtered = useMemo(() => {
    if (!isSearching) return sections;
    const q = query.trim().toLowerCase();
    return sections
      .map((s) => ({
        ...s,
        items: s.items.filter((e) => e.shortcode.includes(q)),
      }))
      .filter((s) => s.items.length > 0);
  }, [sections, query, isSearching]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-[var(--color-divider)] px-3 py-2">
        <Search className="h-4 w-4 shrink-0 text-[var(--color-text-faint)]" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search stickers"
          className="h-7 w-full bg-transparent text-sm outline-none placeholder:text-[var(--color-text-faint)]"
          spellCheck={false}
          autoComplete="off"
        />
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {filtered.length === 0 ? (
          <div className="py-8 text-center text-xs text-[var(--color-text-muted)]">
            {stickers.length === 0
              ? 'No stickers in your packs yet.'
              : `No stickers match “${query.trim()}”.`}
          </div>
        ) : (
          filtered.map((section) => (
            <div key={section.id} className="pt-2 first:pt-0">
              <div className="sticky top-0 z-10 -mx-2 bg-[var(--color-panel-2)] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                {section.label}
              </div>
              <div className="grid grid-cols-3 gap-1">
                {section.items.map((s) => (
                  <button
                    key={`${s.shortcode}-${s.mxc}`}
                    type="button"
                    onClick={() => onSelect(s)}
                    className="flex aspect-square items-center justify-center bg-[var(--color-panel)] hover:bg-[var(--color-hover-overlay)] focus-visible:bg-[var(--color-hover-overlay)] focus-visible:outline-none"
                    aria-label={`Send :${s.shortcode}:`}
                    title={`:${s.shortcode}:`}
                  >
                    <AuthedImage
                      client={client}
                      mxc={s.mxc}
                      width={192}
                      height={192}
                      className="max-h-full max-w-full object-contain"
                      fallback={<span className="font-mono text-xs">:{s.shortcode}:</span>}
                    />
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
