import { describe, expect, it } from 'vitest';
import { getImageUrlCandidates, normalizeImageUrl } from '../imageUrl';

describe('imageUrl', () => {
  it('normalizes google drive share links to browser-loadable image urls', () => {
    expect(
      normalizeImageUrl('https://drive.google.com/file/d/1AbCDefG123456/view?usp=sharing'),
    ).toBe('https://drive.google.com/thumbnail?id=1AbCDefG123456&sz=w2000');
  });

  it('tries the google drive thumbnail endpoint before legacy uc endpoints', () => {
    expect(
      getImageUrlCandidates('https://drive.google.com/open?id=1AbCDefG123456')[0],
    ).toBe('https://drive.google.com/thumbnail?id=1AbCDefG123456&sz=w2000');
  });

  it('includes direct googleusercontent fallbacks for drive images', () => {
    const candidates = getImageUrlCandidates('https://drive.google.com/open?id=1AbCDefG123456');
    expect(candidates).toContain(
      'https://drive.usercontent.google.com/download?id=1AbCDefG123456&export=view',
    );
    expect(candidates).toContain('https://lh3.googleusercontent.com/d/1AbCDefG123456=s2000');
  });

  it('leaves non-drive urls unchanged', () => {
    expect(normalizeImageUrl('https://example.com/image.png')).toBe('https://example.com/image.png');
  });
});
