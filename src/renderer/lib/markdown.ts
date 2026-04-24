import DOMPurify from 'dompurify';
import { marked } from 'marked';

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

const ALLOWED_ATTR = ['href', 'title', 'alt', 'src', 'class', 'data-mx-pill', 'rel', 'target'];

export function plainTextToHtml(body: string): string {
  const html = marked.parse(body, { async: false }) as string;
  return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR });
}

export function sanitizeEventHtml(htmlFromEvent: string): string {
  return DOMPurify.sanitize(htmlFromEvent, { ALLOWED_TAGS, ALLOWED_ATTR });
}

export function composeTextContent(body: string): {
  msgtype: 'm.text';
  body: string;
  format?: 'org.matrix.custom.html';
  formatted_body?: string;
} {
  const html = plainTextToHtml(body);
  // If the output doesn't contain anything beyond a plain paragraph, skip HTML.
  const strippedPlain = html
    .replace(/<p>|<\/p>/g, '')
    .replace(/<br\s*\/?>/g, '\n')
    .trim();
  if (strippedPlain === body.trim() || !/<[a-z][^>]*>/i.test(html)) {
    return { msgtype: 'm.text', body };
  }
  return {
    msgtype: 'm.text',
    body,
    format: 'org.matrix.custom.html',
    formatted_body: html,
  };
}
