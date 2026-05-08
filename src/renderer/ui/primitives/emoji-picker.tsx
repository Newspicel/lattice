import { useEffect, useMemo, useRef, useState } from 'react';
import { Popover as PopoverPrimitive } from '@base-ui/react/popover';
import { Search } from 'lucide-react';
import type { MatrixClient } from 'matrix-js-sdk';
import {
  EMOJI_CATEGORIES,
  searchEmojis,
  type EmojiEntry,
} from '@/lib/emojiData';
import type { CustomEmoji, CustomEmojiPack } from '@/matrix/customEmojis';
import { EmoteImage } from '@/ui/timeline/EmoteImage';
import { AuthedImage } from '@/lib/mxc';
import { cn } from '@/lib/utils';

interface EmojiPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (emoji: string) => void;
  trigger: React.ReactElement;
  align?: 'start' | 'center' | 'end';
  side?: 'top' | 'bottom' | 'left' | 'right';
  /** Custom emoji packs (emoticon-usage). Omit to keep the picker unicode-only. */
  customPacks?: CustomEmoji[] | CustomEmojiPack[];
  client?: MatrixClient | null;
  onSelectCustom?: (emoji: CustomEmoji) => void;
}

interface CustomSection {
  id: string;
  label: string;
  iconMxc?: string;
  emojis: CustomEmoji[];
}

function groupCustomPacks(
  customPacks: EmojiPickerProps['customPacks'],
): CustomSection[] {
  if (!customPacks || customPacks.length === 0) return [];
  // Two input shapes are supported: a flat CustomEmoji[] (from
  // useAvailableEmoticons) and a pre-grouped CustomEmojiPack[]. The flat form
  // is the common case; we group it by source so the user pack and each room
  // pack render as separate sections.
  if ('shortcode' in (customPacks[0] as object)) {
    const flat = customPacks as CustomEmoji[];
    const buckets = new Map<string, CustomSection>();
    for (const e of flat) {
      const id =
        e.source.kind === 'user'
          ? 'user'
          : `room:${e.source.roomId}:${e.source.stateKey}`;
      const label =
        e.source.kind === 'user' ? 'My emojis' : 'Room emojis';
      let bucket = buckets.get(id);
      if (!bucket) {
        bucket = { id, label, emojis: [] };
        buckets.set(id, bucket);
      }
      bucket.emojis.push(e);
    }
    return Array.from(buckets.values());
  }
  const packs = customPacks as CustomEmojiPack[];
  return packs.map((pack) => ({
    id:
      pack.source.kind === 'user'
        ? 'user'
        : `room:${pack.source.roomId}:${pack.source.stateKey}`,
    label: pack.displayName,
    iconMxc: pack.avatarMxc,
    emojis: pack.emoticons,
  }));
}

export function EmojiPicker({
  open,
  onOpenChange,
  onSelect,
  trigger,
  align = 'start',
  side = 'top',
  customPacks,
  client,
  onSelectCustom,
}: EmojiPickerProps) {
  const sections = useMemo(() => groupCustomPacks(customPacks), [customPacks]);
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
              onSelect={onSelect}
              customSections={sections}
              client={client}
              onSelectCustom={onSelectCustom}
            />
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

function EmojiPickerBody({
  onSelect,
  customSections,
  client,
  onSelectCustom,
}: {
  onSelect: (emoji: string) => void;
  customSections: CustomSection[];
  client?: MatrixClient | null;
  onSelectCustom?: (emoji: CustomEmoji) => void;
}) {
  const [query, setQuery] = useState('');
  const firstId = customSections[0]?.id ?? EMOJI_CATEGORIES[0].id;
  const [activeId, setActiveId] = useState(firstId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const isSearching = query.trim().length > 0;
  const searchResults = useMemo(() => searchEmojis(query), [query]);
  const customSearchResults = useMemo(() => {
    if (!isSearching) return [];
    const q = query.trim().toLowerCase();
    const out: CustomEmoji[] = [];
    const seen = new Set<string>();
    for (const section of customSections) {
      for (const e of section.emojis) {
        if (seen.has(e.shortcode)) continue;
        if (e.shortcode === q || e.shortcode.includes(q)) {
          seen.add(e.shortcode);
          out.push(e);
        }
      }
    }
    out.sort((a, b) => a.shortcode.length - b.shortcode.length);
    return out;
  }, [customSections, query, isSearching]);

  const allSectionIds = [
    ...customSections.map((s) => s.id),
    ...EMOJI_CATEGORIES.map((c) => c.id),
  ];

  function scrollToSection(id: string) {
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
    let current = allSectionIds[0];
    for (const id of allSectionIds) {
      const el = sectionRefs.current[id];
      if (!el) continue;
      if (el.offsetTop - root.offsetTop - 8 <= top) current = id;
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
          customSearchResults.length === 0 && searchResults.length === 0 ? (
            <div className="py-8 text-center text-xs text-[var(--color-text-muted)]">
              No emoji match “{query.trim()}”.
            </div>
          ) : (
            <>
              {customSearchResults.length > 0 && (
                <CustomEmojiGrid
                  items={customSearchResults}
                  client={client}
                  onSelect={(e) => {
                    if (onSelectCustom) onSelectCustom(e);
                    else onSelect(`:${e.shortcode}:`);
                  }}
                />
              )}
              {searchResults.length > 0 && (
                <EmojiGrid items={searchResults} onSelect={onSelect} />
              )}
            </>
          )
        ) : (
          <>
            {customSections.map((section) => (
              <div
                key={section.id}
                ref={(el) => {
                  sectionRefs.current[section.id] = el;
                }}
                className="pt-1.5 first:pt-0"
              >
                <div className="sticky top-0 z-10 -mx-2 bg-[var(--color-panel-2)] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                  {section.label}
                </div>
                <CustomEmojiGrid
                  items={section.emojis}
                  client={client}
                  onSelect={(e) => {
                    if (onSelectCustom) onSelectCustom(e);
                    else onSelect(`:${e.shortcode}:`);
                  }}
                />
              </div>
            ))}
            {EMOJI_CATEGORIES.map((cat) => (
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
            ))}
          </>
        )}
      </div>

      {!isSearching && (
        <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-t border-[var(--color-divider)] px-1.5 py-1">
          {customSections.map((section) => (
            <button
              key={section.id}
              type="button"
              onClick={() => scrollToSection(section.id)}
              className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center transition-colors',
                activeId === section.id
                  ? 'bg-[var(--color-hover-overlay)]'
                  : 'opacity-60 hover:bg-[var(--color-hover-overlay)] hover:opacity-100',
              )}
              aria-label={section.label}
              title={section.label}
            >
              {section.iconMxc ? (
                <AuthedImage
                  client={client}
                  mxc={section.iconMxc}
                  width={32}
                  height={32}
                  className="h-5 w-5 object-contain"
                  fallback={<FallbackPackIcon section={section} client={client} />}
                />
              ) : (
                <FallbackPackIcon section={section} client={client} />
              )}
            </button>
          ))}
          {EMOJI_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => scrollToSection(cat.id)}
              className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center text-base transition-colors',
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

function FallbackPackIcon({
  section,
  client,
}: {
  section: CustomSection;
  client: MatrixClient | null | undefined;
}) {
  const first = section.emojis[0];
  if (!first) return <span className="text-base">★</span>;
  return <EmoteImage client={client} mxc={first.mxc} alt={section.label} size={20} />;
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

function CustomEmojiGrid({
  items,
  client,
  onSelect,
}: {
  items: CustomEmoji[];
  client: MatrixClient | null | undefined;
  onSelect: (emoji: CustomEmoji) => void;
}) {
  return (
    <div className="grid grid-cols-8 gap-0.5">
      {items.map((entry) => (
        <button
          key={`${entry.shortcode}-${entry.mxc}`}
          type="button"
          onClick={() => onSelect(entry)}
          className="flex h-9 w-9 items-center justify-center hover:bg-[var(--color-hover-overlay)] focus-visible:bg-[var(--color-hover-overlay)] focus-visible:outline-none"
          aria-label={`:${entry.shortcode}:`}
          title={`:${entry.shortcode}:`}
        >
          <EmoteImage client={client} mxc={entry.mxc} alt={`:${entry.shortcode}:`} size={26} />
        </button>
      ))}
    </div>
  );
}
