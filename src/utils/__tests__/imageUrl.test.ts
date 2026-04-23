import { describe, expect, it } from 'vitest';
import { normalizeImageUrl } from '../imageUrl';

describe('imageUrl', () => {
  it('normalizes google drive share links to direct download urls', () => {
    expect(
      normalizeImageUrl('https://drive.google.com/file/d/1AbCDefG123456/view?usp=sharing'),
    ).toBe('https://drive.google.com/uc?export=download&id=1AbCDefG123456');
  });

  it('leaves non-drive urls unchanged', () => {
    expect(normalizeImageUrl('https://example.com/image.png')).toBe('https://example.com/image.png');
  });
});

