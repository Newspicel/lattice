import { useEffect, useMemo, useRef, useState } from 'react';
import { Popover as PopoverPrimitive } from '@base-ui/react/popover';
import { Search } from 'lucide-react';
import {
  EMOJI_CATEGORIES,
  searchEmojis,
  type EmojiEntry,
} from '@/lib/emojiData';
import { cn } from '@/lib/utils';

interface EmojiPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (emoji: string) => void;
  trigger: React.ReactElement;
  align?: 'start' | 'center' | 'end';
  side?: 'top' | 'bottom' | 'left' | 'right';
}

export function EmojiPicker({
  open,
  onOpenChange,
  onSelect,
  trigger,
  align = 'start',
  side = 'top',
}: EmojiPickerProps) {
  return (
    <PopoverPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <PopoverPrimitive.Trigger render={trigger} />
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner
          align={align}
          side={side}
          sideOffset={6}
          className="isolate z-50"
        >
          <PopoverPrimitive.Popup
            className="flex h-[360px] w-[340px] flex-col overflow-hidden border border-[var(--color-divider)] bg-[var(--color-panel-2)] text-[var(--color-text)] outline-none data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 transition-opacity duration-100"
            aria-label="Emoji picker"
          >
            <EmojiPickerBody
              onSelect={(e) => {
                onSelect(e);
              }}
            />
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

function EmojiPickerBody({ onSelect }: { onSelect: (emoji: string) => void }) {
  const [query, setQuery] = useState('');
  const [activeId, setActiveId] = useState(EMOJI_CATEGORIES[0].id);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const searchResults = useMemo(() => searchEmojis(query), [query]);
  const isSearching = query.trim().length > 0;

  function scrollToCategory(id: string) {
    const el = sectionRefs.current[id];
    const root = scrollRef.current;
    if (!el || !root) return;
    root.scrollTo({ top: el.offsetTop - root.offsetTop, behavior: 'smooth' });
    setActiveId(id);
  }

  function onScroll() {
    if (isSearching) return;
    const root = scrollRef.current;
    if (!root) return;
    const top = root.scrollTop;
    let current = EMOJI_CATEGORIES[0].id;
    for (const cat of EMOJI_CATEGORIES) {
      const el = sectionRefs.current[cat.id];
      if (!el) continue;
      if (el.offsetTop - root.offsetTop - 8 <= top) current = cat.id;
    }
    if (current !== activeId) setActiveId(current);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-[var(--color-divider)] px-3 py-2">
        <Search className="h-4 w-4 shrink-0 text-[var(--color-text-faint)]" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search emoji"
          className="h-7 w-full bg-transparent text-sm outline-none placeholder:text-[var(--color-text-faint)]"
          spellCheck={false}
          autoComplete="off"
        />
      </div>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto px-2 pb-1.5"
      >
        {isSearching ? (
          searchResults.length === 0 ? (
            <div className="py-8 text-center text-xs text-[var(--color-text-muted)]">
              No emoji match “{query.trim()}”.
            </div>
          ) : (
            <EmojiGrid items={searchResults} onSelect={onSelect} />
          )
        ) : (
          EMOJI_CATEGORIES.map((cat) => (
            <div
              key={cat.id}
              ref={(el) => {
                sectionRefs.current[cat.id] = el;
              }}
              className="pt-1.5 first:pt-0"
            >
              <div className="sticky top-0 z-10 -mx-2 bg-[var(--color-panel-2)] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                {cat.label}
              </div>
              <EmojiGrid items={cat.items} onSelect={onSelect} />
            </div>
          ))
        )}
      </div>

      {!isSearching && (
        <div className="flex shrink-0 items-center justify-between border-t border-[var(--color-divider)] px-1.5 py-1">
          {EMOJI_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => scrollToCategory(cat.id)}
              className={cn(
                'flex h-7 w-7 items-center justify-center text-base transition-colors',
                activeId === cat.id
                  ? 'bg-[var(--color-hover-overlay)]'
                  : 'opacity-60 hover:bg-[var(--color-hover-overlay)] hover:opacity-100',
              )}
              aria-label={cat.label}
              title={cat.label}
            >
              {cat.icon}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function EmojiGrid({
  items,
  onSelect,
}: {
  items: EmojiEntry[];
  onSelect: (emoji: string) => void;
}) {
  return (
    <div className="grid grid-cols-8 gap-0.5">
      {items.map((entry, i) => (
        <button
          key={`${entry.e}-${i}`}
          type="button"
          onClick={() => onSelect(entry.e)}
          className="flex h-9 w-9 items-center justify-center text-xl leading-none hover:bg-[var(--color-hover-overlay)] focus-visible:bg-[var(--color-hover-overlay)] focus-visible:outline-none"
          aria-label={entry.n}
          title={entry.n}
        >
          {entry.e}
        </button>
      ))}
    </div>
  );
}
