// Discord/Slack-style emoji shortcodes (`:thumbsup:` → 👍).
//
// Backed by `emojibase-data` shortcode presets. We merge multiple sources
// in priority order — github (gemoji, what Discord uses) wins, then iamcal
// (Slack), then emojibase (extra aliases like `lmao`), then cldr (descriptive
// long-form like `face_with_tears_of_joy`). The first source to claim a code
// owns it; later sources only fill gaps.

import type { CustomEmoji } from '@/matrix/customEmojis';
import emojibase from 'emojibase-data/en/data.json';
import githubShortcodes from 'emojibase-data/en/shortcodes/github.json';
import iamcalShortcodes from 'emojibase-data/en/shortcodes/iamcal.json';
import emojibaseShortcodes from 'emojibase-data/en/shortcodes/emojibase.json';
import cldrShortcodes from 'emojibase-data/en/shortcodes/cldr.json';
import type { Emoji, ShortcodesDataset } from 'emojibase';

function buildHexToEmoji(): Map<string, string> {
  const map = new Map<string, string>();
  for (const entry of emojibase as Emoji[]) {
    if (!entry.hexcode) continue;
    map.set(entry.hexcode, entry.emoji);
    // Shortcode files key by the raw codepoint without the FE0F variation
    // selector (e.g. heart `2764-FE0F` is keyed under `2764`). Index both.
    const stripped = entry.hexcode.replace(/-FE0F$/, '');
    if (stripped !== entry.hexcode && !map.has(stripped)) {
      map.set(stripped, entry.emoji);
    }
  }
  return map;
}

const HEX_TO_EMOJI = buildHexToEmoji();

function buildMap(): Map<string, string> {
  const map = new Map<string, string>();
  const sources: ShortcodesDataset[] = [
    githubShortcodes,
    iamcalShortcodes,
    emojibaseShortcodes,
    cldrShortcodes,
  ];
  for (const source of sources) {
    for (const [hex, codes] of Object.entries(source)) {
      const emoji = HEX_TO_EMOJI.get(hex);
      if (!emoji || !codes) continue;
      const list = Array.isArray(codes) ? codes : [codes];
      for (const raw of list) {
        const code = raw.toLowerCase().replace(/^:|:$/g, '');
        if (code && !map.has(code)) map.set(code, emoji);
      }
    }
  }
  return map;
}

const SHORTCODE_MAP = buildMap();

export function lookupShortcode(code: string): string | null {
  return SHORTCODE_MAP.get(code.toLowerCase()) ?? null;
}

const SHORTCODE_RE = /:([a-z0-9_+-]+):/gi;

export function replaceShortcodes(text: string): string {
  return text.replace(SHORTCODE_RE, (match, code: string) => {
    const emoji = SHORTCODE_MAP.get(code.toLowerCase());
    return emoji ?? match;
  });
}

export interface ShortcodeMatch {
  code: string;
  emoji: string;
}

// Rank: exact > prefix > contains. Within each bucket, shorter codes win.
// Dedupe by emoji so we don't show three rows for 👍.
export function searchShortcodes(query: string, limit = 8): ShortcodeMatch[] {
  const q = query.toLowerCase();
  if (!q) return [];
  const exact: ShortcodeMatch[] = [];
  const prefix: ShortcodeMatch[] = [];
  const contains: ShortcodeMatch[] = [];
  for (const [code, emoji] of SHORTCODE_MAP) {
    if (code === q) exact.push({ code, emoji });
    else if (code.startsWith(q)) prefix.push({ code, emoji });
    else if (code.includes(q)) contains.push({ code, emoji });
  }
  prefix.sort((a, b) => a.code.length - b.code.length);
  contains.sort((a, b) => a.code.length - b.code.length);
  const seen = new Set<string>();
  const out: ShortcodeMatch[] = [];
  for (const m of [...exact, ...prefix, ...contains]) {
    if (seen.has(m.emoji)) continue;
    seen.add(m.emoji);
    out.push(m);
    if (out.length >= limit) break;
  }
  return out;
}

// Detect an in-progress `:query` pattern at the caret. The `:` must be at
// the start of input or preceded by a non-word character (so we don't
// trigger on URLs like `http://` or `foo:bar`).
export function detectActiveShortcode(
  text: string,
  cursor: number,
): { start: number; query: string } | null {
  let i = cursor - 1;
  while (i >= 0 && /[a-z0-9_+-]/i.test(text[i])) i--;
  if (i < 0 || text[i] !== ':') return null;
  if (i > 0 && /[a-z0-9_]/i.test(text[i - 1])) return null;
  return { start: i, query: text.slice(i + 1, cursor) };
}

// Replace a `:code:` ending at `cursor` in `text`. Returns the new text and
// the new caret position, or null if there's no shortcode to replace.
//
// `skipCodes` opts a shortcode out of eager replacement — pass the set of
// custom-emoji shortcodes so a `:foo:` typed by the user keeps its colon-form
// when a custom emoji shadows the unicode one.
export function replaceShortcodeAtCursor(
  text: string,
  cursor: number,
  skipCodes?: Set<string>,
): { text: string; cursor: number } | null {
  if (cursor < 2 || text[cursor - 1] !== ':') return null;
  const before = text.slice(0, cursor - 1);
  const match = before.match(/:([a-z0-9_+-]+)$/i);
  if (!match) return null;
  const code = match[1].toLowerCase();
  if (skipCodes?.has(code)) return null;
  const emoji = SHORTCODE_MAP.get(code);
  if (!emoji) return null;
  const start = before.length - match[0].length;
  const end = cursor;
  return {
    text: text.slice(0, start) + emoji + text.slice(end),
    cursor: start + emoji.length,
  };
}

export type AutocompleteEntry =
  | { kind: 'unicode'; code: string; emoji: string }
  | { kind: 'custom'; emoji: CustomEmoji };

// Custom emojis take priority on collisions. Within each tier (exact > prefix >
// contains), customs come before unicode so `:smile:` defined as a custom
// emoji wins over 😄.
export function searchCombined(
  query: string,
  customs: CustomEmoji[],
  limit = 8,
): AutocompleteEntry[] {
  const q = query.toLowerCase();
  if (!q) return [];

  const seenCodes = new Set<string>();
  const customExact: AutocompleteEntry[] = [];
  const customPrefix: AutocompleteEntry[] = [];
  const customContains: AutocompleteEntry[] = [];
  for (const e of customs) {
    if (seenCodes.has(e.shortcode)) continue;
    seenCodes.add(e.shortcode);
    if (e.shortcode === q) customExact.push({ kind: 'custom', emoji: e });
    else if (e.shortcode.startsWith(q)) customPrefix.push({ kind: 'custom', emoji: e });
    else if (e.shortcode.includes(q)) customContains.push({ kind: 'custom', emoji: e });
  }
  customPrefix.sort((a, b) =>
    a.kind === 'custom' && b.kind === 'custom'
      ? a.emoji.shortcode.length - b.emoji.shortcode.length
      : 0,
  );
  customContains.sort((a, b) =>
    a.kind === 'custom' && b.kind === 'custom'
      ? a.emoji.shortcode.length - b.emoji.shortcode.length
      : 0,
  );

  const unicodeExact: AutocompleteEntry[] = [];
  const unicodePrefix: AutocompleteEntry[] = [];
  const unicodeContains: AutocompleteEntry[] = [];
  const seenUnicode = new Set<string>();
  for (const [code, emoji] of SHORTCODE_MAP) {
    if (seenCodes.has(code)) continue; // custom shadows unicode
    if (seenUnicode.has(emoji)) continue;
    if (code === q) {
      unicodeExact.push({ kind: 'unicode', code, emoji });
      seenUnicode.add(emoji);
    } else if (code.startsWith(q)) {
      unicodePrefix.push({ kind: 'unicode', code, emoji });
      seenUnicode.add(emoji);
    } else if (code.includes(q)) {
      unicodeContains.push({ kind: 'unicode', code, emoji });
      seenUnicode.add(emoji);
    }
  }
  unicodePrefix.sort((a, b) =>
    a.kind === 'unicode' && b.kind === 'unicode' ? a.code.length - b.code.length : 0,
  );
  unicodeContains.sort((a, b) =>
    a.kind === 'unicode' && b.kind === 'unicode' ? a.code.length - b.code.length : 0,
  );

  const out = [
    ...customExact, ...unicodeExact,
    ...customPrefix, ...unicodePrefix,
    ...customContains, ...unicodeContains,
  ];
  return out.slice(0, limit);
}
