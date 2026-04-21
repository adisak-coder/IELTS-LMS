import { describe, expect, it } from 'vitest';
import { sanitizeHtml } from '../sanitizeHtml';

describe('sanitizeHtml', () => {
  it('removes script tags', () => {
    const result = sanitizeHtml('<script>alert(1)</script><p>Hello</p>');
    expect(result).not.toMatch(/<script/i);
    expect(result).toContain('<p>Hello</p>');
  });

  it('strips inline event handlers', () => {
    const result = sanitizeHtml('<img src="x" onerror="alert(1)" />');
    expect(result).not.toMatch(/onerror\s*=/i);
  });

  it('neutralizes javascript: URLs', () => {
    const result = sanitizeHtml('<a href="javascript:alert(1)">x</a>');
    expect(result).not.toMatch(/javascript:/i);
  });
});

