import { describe, expect, test } from 'vitest';
import { htmlToPlainText } from '../htmlText';

describe('htmlToPlainText', () => {
  test('converts block-level html boundaries into normalized line breaks', () => {
    const input = '<div> First line </div><p>Second line</p><li>Third line</li>';

    expect(htmlToPlainText(input)).toBe('First line\nSecond line\nThird line');
  });

  test('decodes html entities for tagged and non-tagged input', () => {
    expect(htmlToPlainText('Tom&nbsp;&amp;&nbsp;Jerry &lt;3')).toBe('Tom & Jerry <3');
    expect(htmlToPlainText('<div>A&amp;B</div><div>C&nbsp;D</div>')).toBe('A&B\nC D');
  });

  test('collapses repeated whitespace and trims each line', () => {
    const input = '  Alpha    beta \n\t second\t\tline  \n\n';

    expect(htmlToPlainText(input)).toBe('Alpha beta\nsecond line');
  });

  test('removes script and style payloads before converting text', () => {
    const input =
      '<div>Safe</div><script>alert("x")</script><style>.x{display:none;}</style><div>Text</div>';

    expect(htmlToPlainText(input)).toBe('Safe\nText');
  });
});
