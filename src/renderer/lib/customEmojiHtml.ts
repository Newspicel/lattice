import type { CustomEmoji } from '@/matrix/customEmojis';

const SHORTCODE_RE = /:([a-z0-9_+-]+):/gi;
const EMOTE_HEIGHT = 32;

/**
 * Build the inline `<img data-mx-emoticon>` tag MSC2545 specifies. Centralised
 * so the format and clamped height stay in one place.
 */
export function emoteImgTag(emoji: CustomEmoji): string {
  const alt = `:${emoji.shortcode}:`;
  return `<img data-mx-emoticon src="${escapeAttr(emoji.mxc)}" alt="${escapeAttr(alt)}" title="${escapeAttr(alt)}" height="${EMOTE_HEIGHT}" />`;
}

/**
 * Replace every `:shortcode:` token in `body` with the MSC2545 inline tag if
 * the lookup resolves. HTML-escapes surrounding text so the result is safe
 * to feed into `DOMPurify.sanitize` together with the rest of the formatted
 * body. `touched` tells the caller whether at least one substitution happened
 * (i.e. whether they need to emit `formatted_body`).
 */
export function bodyToFormattedHtml(
  body: string,
  resolve: (shortcode: string) => CustomEmoji | null,
): { html: string; touched: boolean } {
  let touched = false;
  let out = '';
  let lastIndex = 0;
  for (const match of body.matchAll(SHORTCODE_RE)) {
    const code = match[1].toLowerCase();
    const emoji = resolve(code);
    if (!emoji) continue;
    const start = match.index ?? 0;
    out += escapeText(body.slice(lastIndex, start));
    out += emoteImgTag(emoji);
    lastIndex = start + match[0].length;
    touched = true;
  }
  out += escapeText(body.slice(lastIndex));
  return { html: out, touched };
}

export interface ParsedEmoteImg {
  mxc: string;
  alt: string;
  height?: number;
}

export function parseEmoteImg(el: HTMLImageElement): ParsedEmoteImg | null {
  if (!el.hasAttribute('data-mx-emoticon')) return null;
  const src = el.getAttribute('src') ?? '';
  if (!src.startsWith('mxc://')) return null;
  const heightAttr = el.getAttribute('height');
  const heightNum = heightAttr ? Number.parseInt(heightAttr, 10) : NaN;
  return {
    mxc: src,
    alt: el.getAttribute('alt') ?? el.getAttribute('title') ?? ':emoji:',
    height: Number.isFinite(heightNum) ? heightNum : undefined,
  };
}

function escapeText(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
