// Emoji dataset sourced from `emojibase-data` (Unicode 16, full coverage).
// We project the upstream `Emoji[]` shape into the lighter `EmojiEntry`
// the picker consumes (just emoji char + searchable keyword string).

import emojibase from 'emojibase-data/en/data.json';
import type { Emoji } from 'emojibase';

export interface EmojiEntry {
  e: string;
  n: string;
}

export interface EmojiCategory {
  id: string;
  label: string;
  icon: string;
  items: EmojiEntry[];
}

// Group ids as defined in emojibase-data/en/messages.json. Group 2
// (`component`) holds skin-tone modifiers and regional indicator letters
// — they're building blocks, not user-facing emojis, so we drop them.
const CATEGORY_META: { group: number; id: string; label: string; icon: string }[] = [
  { group: 0, id: 'smileys', label: 'Smileys & Emotion', icon: '😀' },
  { group: 1, id: 'people', label: 'People & Body', icon: '👋' },
  { group: 3, id: 'animals', label: 'Animals & Nature', icon: '🐶' },
  { group: 4, id: 'food', label: 'Food & Drink', icon: '🍔' },
  { group: 5, id: 'travel', label: 'Travel & Places', icon: '🚗' },
  { group: 6, id: 'activities', label: 'Activities', icon: '⚽' },
  { group: 7, id: 'objects', label: 'Objects', icon: '💡' },
  { group: 8, id: 'symbols', label: 'Symbols', icon: '✨' },
  { group: 9, id: 'flags', label: 'Flags', icon: '🏳️' },
];

function buildCategories(): EmojiCategory[] {
  const buckets = new Map<number, EmojiEntry[]>();
  const sorted = [...(emojibase as Emoji[])].sort(
    (a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER),
  );
  for (const entry of sorted) {
    if (entry.group === undefined || entry.group === 2) continue;
    const tags = (entry.tags ?? []).join(' ');
    const n = `${entry.label} ${tags}`.toLowerCase();
    const list = buckets.get(entry.group) ?? [];
    list.push({ e: entry.emoji, n });
    buckets.set(entry.group, list);
  }
  return CATEGORY_META.map((meta) => ({
    id: meta.id,
    label: meta.label,
    icon: meta.icon,
    items: buckets.get(meta.group) ?? [],
  }));
}

export const EMOJI_CATEGORIES: EmojiCategory[] = buildCategories();

const ALL_EMOJIS: EmojiEntry[] = EMOJI_CATEGORIES.flatMap((c) => c.items);

export function searchEmojis(query: string): EmojiEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const out: EmojiEntry[] = [];
  for (const entry of ALL_EMOJIS) {
    if (entry.n.includes(q)) {
      out.push(entry);
      if (out.length >= 200) break;
    }
  }
  return out;
}
