import DOMPurify from 'dompurify';
import { marked } from 'marked';
import type { CustomEmoji } from '@/matrix/customEmojis';
import { bodyToFormattedHtml } from './customEmojiHtml';

marked.setOptions({ gfm: true, breaks: true });

const ALLOWED_TAGS = [
  'a',
  'b',
  'br',
  'blockquote',
  'code',
  'del',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'i',
  'li',
  'ol',
  'p',
  'pre',
  'span',
  'strong',
  'sub',
  'sup',
  'u',
  'ul',
  'img',
];

const ALLOWED_ATTR = [
  'href',
  'title',
  'alt',
  'src',
  'class',
  'data-mx-pill',
  'rel',
  'target',
  'data-mx-emoticon',
  'height',
  'width',
];

const SAFE_HREF = /^(https?:|mailto:|matrix:|#)/i;
const MAX_EMOTE_HEIGHT = 32;

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (!(node instanceof HTMLElement)) return;
  if (node.tagName === 'IMG') {
    // MSC2545 only — every other <img> is dropped. The src is left as
    // mxc:// for the React layer to resolve with auth; bare http(s) <img>
    // would leak referrers and bypass the media cache.
    if (!node.hasAttribute('data-mx-emoticon')) {
      node.parentNode?.removeChild(node);
      return;
    }
    const src = node.getAttribute('src') ?? '';
    if (!src.startsWith('mxc://')) {
      node.parentNode?.removeChild(node);
      return;
    }
    node.removeAttribute('width');
    const declared = parseInt(node.getAttribute('height') ?? '', 10);
    const clamped =
      Number.isFinite(declared) && declared > 0
        ? Math.min(declared, MAX_EMOTE_HEIGHT)
        : MAX_EMOTE_HEIGHT;
    node.setAttribute('height', String(clamped));
    return;
  }
  if (node.tagName !== 'A') return;
  const href = node.getAttribute('href');
  if (!href || !SAFE_HREF.test(href)) {
    node.removeAttribute('href');
    return;
  }
  node.setAttribute('target', '_blank');
  node.setAttribute('rel', 'noopener noreferrer');
});

export function plainTextToHtml(body: string): string {
  const html = marked.parse(body, { async: false }) as string;
  return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR });
}

export function sanitizeEventHtml(htmlFromEvent: string): string {
  return DOMPurify.sanitize(htmlFromEvent, { ALLOWED_TAGS, ALLOWED_ATTR });
}

const URL_REGEX = /\b(https?:\/\/[^\s<>"'`]+)/g;
const TRAILING_PUNCT = /[.,!?;:)\]}>'"`]+$/;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function renderPlainBody(body: string): string {
  const withLinks = escapeHtml(body).replace(URL_REGEX, (match) => {
    const trailing = match.match(TRAILING_PUNCT)?.[0] ?? '';
    const url = trailing ? match.slice(0, -trailing.length) : match;
    if (!SAFE_HREF.test(url)) return match;
    return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>${trailing}`;
  });
  const withBreaks = withLinks.replace(/\n/g, '<br>');
  return DOMPurify.sanitize(withBreaks, { ALLOWED_TAGS, ALLOWED_ATTR });
}

export function composeTextContent(body: string): {
  msgtype: 'm.text';
  body: string;
  format?: 'org.matrix.custom.html';
  formatted_body?: string;
} {
  return composeMessageContent(body);
}

/**
 * Like {@link composeTextContent} but also substitutes MSC2545 custom emoji
 * shortcodes with inline `<img data-mx-emoticon>` tags. The plain `body` keeps
 * the `:name:` form so spec-compliant fallbacks still work; `formatted_body`
 * carries the HTML.
 *
 * Custom emoji substitution runs BEFORE the markdown render so a `:smile:`
 * custom emoji wins over the unicode 😄 shortcode. The plain body keeps
 * `:smile:` text, which is what MSC2545 expects clients to fall back to.
 */
export function composeMessageContent(
  body: string,
  resolveCustom?: (shortcode: string) => CustomEmoji | null,
): {
  msgtype: 'm.text';
  body: string;
  format?: 'org.matrix.custom.html';
  formatted_body?: string;
} {
  let custom: { html: string; touched: boolean } | null = null;
  if (resolveCustom) {
    custom = bodyToFormattedHtml(body, resolveCustom);
  }

  const html = plainTextToHtml(body);
  const strippedPlain = html
    .replace(/<p>|<\/p>/g, '')
    .replace(/<br\s*\/?>/g, '\n')
    .trim();
  const markdownEmittedHtml =
    strippedPlain !== body.trim() && /<[a-z][^>]*>/i.test(html);

  if (custom?.touched) {
    // Use the markdown-rendered HTML as the structural base, then re-run the
    // custom-emoji substitution on the body and splice it into the output so
    // `:foo:` becomes an inline image even when the surrounding text was
    // also formatted (e.g. **bold** with :emoji:).
    const formatted = markdownEmittedHtml
      ? interpolateCustomEmojiInHtml(html, resolveCustom!)
      : `<p>${custom.html}</p>`;
    return {
      msgtype: 'm.text',
      body,
      format: 'org.matrix.custom.html',
      formatted_body: formatted,
    };
  }

  if (!markdownEmittedHtml) {
    return { msgtype: 'm.text', body };
  }
  return {
    msgtype: 'm.text',
    body,
    format: 'org.matrix.custom.html',
    formatted_body: html,
  };
}

/**
 * Walk the marked-rendered HTML and replace `:shortcode:` text in text nodes
 * (only) with the MSC2545 inline tag. Leaves attributes and code blocks alone
 * so we don't munge URLs or `<code>:smile:</code>` examples.
 */
function interpolateCustomEmojiInHtml(
  html: string,
  resolveCustom: (shortcode: string) => CustomEmoji | null,
): string {
  return html.replace(
    /(<code\b[^>]*>[\s\S]*?<\/code>|<pre\b[^>]*>[\s\S]*?<\/pre>)|:([a-z0-9_+-]+):/gi,
    (match, codeBlock, code) => {
      if (codeBlock) return codeBlock;
      const emoji = resolveCustom(String(code).toLowerCase());
      if (!emoji) return match;
      const alt = `:${emoji.shortcode}:`;
      return `<img data-mx-emoticon src="${escapeAttr(emoji.mxc)}" alt="${escapeAttr(alt)}" title="${escapeAttr(alt)}" height="32" />`;
    },
  );
}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
