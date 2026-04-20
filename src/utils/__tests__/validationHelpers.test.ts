import { describe, expect, it } from 'vitest';
import { validateWordCountRanges } from '../validationHelpers';

describe('validateWordCountRanges', () => {
  it('flags NaN inputs as invalid', () => {
    const errors = validateWordCountRanges({
      optimalMin: Number.NaN,
      optimalMax: 250,
      warningMin: 150,
      warningMax: 300,
    });

    expect(errors.length).toBeGreaterThan(0);
  });
});

