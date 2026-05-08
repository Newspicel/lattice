import type { MatrixClient } from 'matrix-js-sdk';
import { Fragment, createElement, type ReactNode } from 'react';
import { EmoteImage } from '@/ui/timeline/EmoteImage';
import { parseEmoteImg } from './customEmojiHtml';

const ALLOWED_TAGS = new Set([
  'a', 'b', 'br', 'blockquote', 'code', 'del', 'em',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr',
  'i', 'li', 'ol', 'p', 'pre', 'span', 'strong',
  'sub', 'sup', 'u', 'ul',
]);

const ALLOWED_ATTRS_BY_TAG: Record<string, Set<string>> = {
  a: new Set(['href', 'title', 'target', 'rel', 'class']),
  span: new Set(['class', 'data-mx-pill']),
  code: new Set(['class']),
  pre: new Set(['class']),
};

interface HtmlBodyProps {
  html: string;
  client: MatrixClient | null | undefined;
}

/**
 * Sanitised event HTML → React tree. The sanitiser has already removed
 * disallowed tags; here we walk the DOM, swap `<img data-mx-emoticon>` for
 * `<EmoteImage>` (so we use the authenticated media cache), and drop any
 * other `<img>` defensively.
 */
export function HtmlBody({ html, client }: HtmlBodyProps) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const nodes = Array.from(doc.body.childNodes).map((node, i) =>
    renderNode(node, `n${i}`, client),
  );
  return <>{nodes}</>;
}

function renderNode(
  node: Node,
  key: string,
  client: MatrixClient | null | undefined,
): ReactNode {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return null;
  }
  const el = node as Element;
  const tag = el.tagName.toLowerCase();

  if (tag === 'img') {
    if (!(el instanceof HTMLImageElement)) return null;
    const parsed = parseEmoteImg(el);
    if (!parsed) return null;
    return (
      <EmoteImage
        key={key}
        client={client}
        mxc={parsed.mxc}
        alt={parsed.alt}
        size={parsed.height ?? 22}
      />
    );
  }

  if (!ALLOWED_TAGS.has(tag)) {
    // Render children inline instead of dropping content; the sanitiser
    // shouldn't be letting unknown tags through, but be defensive.
    return (
      <Fragment key={key}>
        {Array.from(el.childNodes).map((child, i) =>
          renderNode(child, `${key}-${i}`, client),
        )}
      </Fragment>
    );
  }

  const props: Record<string, unknown> = { ...collectAttrs(el, tag), key };
  const children = Array.from(el.childNodes).map((child, i) =>
    renderNode(child, `${key}-${i}`, client),
  );

  // Self-closing tags don't take children.
  if (tag === 'br' || tag === 'hr') {
    return createElement(tag, props);
  }
  return createElement(tag, props, ...children);
}

function collectAttrs(el: Element, tag: string): Record<string, string> {
  const allowed = ALLOWED_ATTRS_BY_TAG[tag];
  if (!allowed) return {};
  const out: Record<string, string> = {};
  for (const attr of Array.from(el.attributes)) {
    if (!allowed.has(attr.name)) continue;
    if (attr.name === 'class') out.className = attr.value;
    else out[attr.name] = attr.value;
  }
  return out;
}
