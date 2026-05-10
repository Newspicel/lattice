import { describe, expect, it } from 'vitest';
import type { CustomEmoji } from '@/matrix/customEmojis';
import {
  composeMessageContent,
  composeTextContent,
  plainTextToHtml,
  renderPlainBody,
  sanitizeEventHtml,
} from './markdown';

function emoji(shortcode: string, mxc = `mxc://example.org/${shortcode}`): CustomEmoji {
  return {
    shortcode,
    mxc,
    usage: ['emoticon'],
    source: { kind: 'user' },
  };
}

describe('composeTextContent', () => {
  it('sends a plain text message without html formatting for simple bodies', () => {
    const content = composeTextContent('hello world');
    expect(content.msgtype).toBe('m.text');
    expect(content.body).toBe('hello world');
    expect(content.format).toBeUndefined();
    expect(content.formatted_body).toBeUndefined();
  });

  it('emits formatted_body when markdown is used', () => {
    const content = composeTextContent('**bold** and *italic*');
    expect(content.body).toBe('**bold** and *italic*');
    expect(content.format).toBe('org.matrix.custom.html');
    expect(content.formatted_body).toContain('<strong>bold</strong>');
    expect(content.formatted_body).toContain('<em>italic</em>');
  });

  it('sanitizes dangerous html', () => {
    const content = composeTextContent('<script>alert(1)</script> hi');
    expect(content.formatted_body ?? '').not.toContain('<script>');
  });

  it('keeps multi-line plain bodies as text-only when no markdown was used', () => {
    // marked emits <br> for newlines under {breaks: true}, but the round-trip
    // through stripPlain should still match the input — so no formatted_body.
    const content = composeTextContent('line one\nline two');
    expect(content.format).toBeUndefined();
    expect(content.formatted_body).toBeUndefined();
  });

  it('keeps the raw body verbatim while emitting formatted_body for code spans', () => {
    const content = composeTextContent('use `cn()` here');
    expect(content.body).toBe('use `cn()` here');
    expect(content.format).toBe('org.matrix.custom.html');
    expect(content.formatted_body).toContain('<code>cn()</code>');
  });
});

describe('composeMessageContent with custom emoji', () => {
  it('substitutes :shortcode: with an inline emote img and keeps the plain body', () => {
    const resolve = (code: string) => (code === 'smile' ? emoji('smile') : null);
    const content = composeMessageContent('hi :smile:', resolve);
    expect(content.body).toBe('hi :smile:');
    expect(content.format).toBe('org.matrix.custom.html');
    expect(content.formatted_body).toContain('data-mx-emoticon');
    expect(content.formatted_body).toContain('mxc://example.org/smile');
    expect(content.formatted_body).toContain('alt=":smile:"');
  });

  it('does not turn unknown shortcodes into emote tags', () => {
    const content = composeMessageContent('hi :notfound:', () => null);
    expect(content.format).toBeUndefined();
    expect(content.formatted_body).toBeUndefined();
  });

  it('preserves markdown formatting around the emoji', () => {
    const resolve = (code: string) => (code === 'tada' ? emoji('tada') : null);
    const content = composeMessageContent('**woo** :tada:', resolve);
    expect(content.format).toBe('org.matrix.custom.html');
    expect(content.formatted_body).toContain('<strong>woo</strong>');
    expect(content.formatted_body).toContain('data-mx-emoticon');
  });

  it('does not substitute shortcodes inside <code> blocks', () => {
    const resolve = (code: string) => (code === 'smile' ? emoji('smile') : null);
    // Use a markdown code span so the renderer wraps :smile: in <code>.
    const content = composeMessageContent('try `:smile:` plus :smile:', resolve);
    expect(content.formatted_body).toContain('<code>:smile:</code>');
    // The bare `:smile:` outside the code span should still substitute.
    expect(content.formatted_body).toContain('data-mx-emoticon');
  });

  it('escapes attribute-unsafe characters in shortcodes/mxc urls', () => {
    const resolve = () => emoji('quote', 'mxc://example.org/has"quote');
    const content = composeMessageContent(':quote:', resolve);
    // Either escape the quote or strip it — but the dangerous form must be gone.
    expect(content.formatted_body).not.toContain('mxc://example.org/has"quote');
  });
});

describe('plainTextToHtml', () => {
  it('renders gfm-style autolinks for bare URLs', () => {
    const html = plainTextToHtml('check https://example.org now');
    expect(html).toContain('<a');
    expect(html).toContain('href="https://example.org"');
  });

  it('drops <script> and other disallowed tags', () => {
    const html = plainTextToHtml('<script>x()</script>hello');
    expect(html).not.toContain('<script>');
    expect(html).toContain('hello');
  });

  it('drops bare <img> tags (not flagged as MSC2545 emoticons)', () => {
    const html = plainTextToHtml('<img src="https://evil.example/track.gif" />');
    expect(html).not.toContain('<img');
  });

  it('drops <a href> with a non-http scheme', () => {
    const html = plainTextToHtml('[click](javascript:alert(1))');
    // The anchor either loses its href or the link is not emitted as a link.
    expect(html).not.toMatch(/href="javascript:/i);
  });
});

describe('sanitizeEventHtml', () => {
  it('keeps allowed tags and attributes', () => {
    const html = sanitizeEventHtml(
      '<p><strong>hi</strong> <a href="https://example.org">x</a></p>',
    );
    expect(html).toContain('<strong>hi</strong>');
    expect(html).toContain('href="https://example.org"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('strips disallowed tags but preserves their text', () => {
    const html = sanitizeEventHtml('<iframe>nope</iframe>hello');
    expect(html).not.toContain('<iframe');
    expect(html).toContain('hello');
  });

  it('drops img tags whose src is not mxc://', () => {
    const html = sanitizeEventHtml(
      '<p><img data-mx-emoticon src="https://evil.example/track.gif"></p>',
    );
    expect(html).not.toContain('<img');
  });

  it('preserves mxc:// emote imgs in event html', () => {
    const html = sanitizeEventHtml(
      '<p>hi <img data-mx-emoticon src="mxc://x/y" alt=":x:" height="32"></p>',
    );
    expect(html).toContain('data-mx-emoticon');
    expect(html).toContain('src="mxc://x/y"');
    expect(html).toContain('alt=":x:"');
  });
});

describe('renderPlainBody', () => {
  it('linkifies bare urls', () => {
    const html = renderPlainBody('see https://example.org for details');
    expect(html).toContain('<a');
    expect(html).toContain('href="https://example.org"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('moves trailing punctuation outside the link', () => {
    const html = renderPlainBody('see https://example.org.');
    // The dot must not be part of the href.
    expect(html).toMatch(/href="https:\/\/example\.org"/);
    expect(html).toContain('.');
  });

  it('escapes html so user input cannot inject markup', () => {
    const html = renderPlainBody('<script>alert(1)</script>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('turns newlines into <br>', () => {
    const html = renderPlainBody('one\ntwo');
    expect(html).toContain('<br>');
  });
});
