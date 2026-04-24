import { describe, expect, it } from 'vitest';
import { composeTextContent } from './markdown';

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
  });

  it('sanitizes dangerous html', () => {
    const content = composeTextContent('<script>alert(1)</script> hi');
    expect(content.formatted_body ?? '').not.toContain('<script>');
  });
});
