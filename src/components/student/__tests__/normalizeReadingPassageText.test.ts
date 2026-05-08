import { describe, expect, it } from 'vitest';
import {
  normalizeReadingContentForHighlightedFormattedText,
  normalizeReadingContentForHighlightText,
} from '../normalizeReadingPassageText';

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

  it('preserves bold and italic emphasis markers for FormattedText highlight mode', () => {
    const input =
      '<p><em>You should spend about 20 minutes on <strong>Questions 1-13</strong>.</em></p>';

    const output = normalizeReadingContentForHighlightedFormattedText(input);

    expect(output).toContain('Questions 1-13');
    expect(output).toContain('***Questions 1-13***');
    expect(output.startsWith('*You should spend about 20 minutes on')).toBe(true);
  });

  it('preserves editor-style emphasis markers from span styles and classes', () => {
    const input =
      '<p><span style="font-style: italic;">You should spend about 20 minutes on <span style="font-weight: 700;" class="ql-bold">Questions 1-13</span>.</span></p>';

    const output = normalizeReadingContentForHighlightedFormattedText(input);

    expect(output).toContain('***Questions 1-13***');
    expect(output.startsWith('*You should spend about 20 minutes on')).toBe(true);
  });
});
