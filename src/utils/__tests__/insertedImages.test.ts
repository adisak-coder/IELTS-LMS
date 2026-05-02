import { describe, expect, it } from 'vitest';
import { coerceInsertedImages, getInsertedImages, supportsInsertedImages } from '../insertedImages';

describe('insertedImages utils', () => {
  it('supports inserted images for non-map/non-diagram types only', () => {
    expect(supportsInsertedImages('TFNG')).toBe(true);
    expect(supportsInsertedImages('SHORT_ANSWER')).toBe(true);
    expect(supportsInsertedImages('MAP')).toBe(false);
    expect(supportsInsertedImages('DIAGRAM_LABELING')).toBe(false);
  });

  it('returns an empty array when insertedImages is missing', () => {
    expect(getInsertedImages({ insertedImages: undefined })).toEqual([]);
  });

  it('coerces legacy inserted images and fills missing IDs', () => {
    const coerced = coerceInsertedImages(
      [
        { id: 'img-1', url: 'https://example.com/one.png', caption: 'One' },
        { url: 'https://example.com/two.png' },
        null,
      ],
      'legacy-img',
    );

    expect(coerced).toHaveLength(2);
    expect(coerced[0]).toEqual({
      id: 'img-1',
      url: 'https://example.com/one.png',
      caption: 'One',
    });
    expect(coerced[1]?.id).toBe('legacy-img-2');
    expect(coerced[1]?.url).toBe('https://example.com/two.png');
    expect(coerced[1]?.caption).toBeUndefined();
  });
});
