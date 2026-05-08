import { describe, expect, it } from 'vitest';
import { normalizeReadingContentForHighlightText } from '../normalizeReadingPassageText';

describe('normalizeReadingContentForHighlightText', () => {
  it('converts html passage content into paragraph-separated plain text for FormattedText highlighting', () => {
    const input =
      '<p>Alpha <strong>beta</strong> gamma.</p><p>Delta <em>epsilon</em> zeta.</p>';

    const output = normalizeReadingContentForHighlightText(input);

    expect(output).toBe('Alpha beta gamma.\n\nDelta epsilon zeta.');
  });

  it('keeps plain text content readable with paragraph separators', () => {
    const input = 'Alpha beta gamma.\nDelta epsilon zeta.\n\nEta theta.';

    const output = normalizeReadingContentForHighlightText(input);

    expect(output).toContain('Alpha beta gamma.');
    expect(output).toContain('Delta epsilon zeta.');
    expect(output).toContain('Eta theta.');
  });
});
