import { describe, expect, it } from 'vitest';
import { addRange, clearRanges, normalizeRanges, removeAtOffset } from '../highlightRangeOps';
import type { HighlightRange } from '../highlightTypes';

describe('highlightRangeOps', () => {
  it('normalizes into sorted, non-overlapping ranges and drops invalid entries', () => {
    const input: HighlightRange[] = [
      { start: 5, end: 10, color: 'yellow' },
      { start: 8, end: 14, color: 'green' },
      { start: -1, end: 2, color: 'blue' },
      { start: 20, end: 20, color: 'amber' },
      { start: 14, end: 16, color: 'green' },
    ];

    expect(normalizeRanges(input, 30)).toEqual([
      { start: 5, end: 8, color: 'yellow' },
      { start: 8, end: 16, color: 'green' },
    ]);
  });

  it('overwrites only overlapping segments when adding a range', () => {
    const current: HighlightRange[] = [{ start: 0, end: 10, color: 'yellow' }];
    const next: HighlightRange = { start: 3, end: 7, color: 'blue' };

    expect(addRange(current, next, 20)).toEqual([
      { start: 0, end: 3, color: 'yellow' },
      { start: 3, end: 7, color: 'blue' },
      { start: 7, end: 10, color: 'yellow' },
    ]);
  });

  it('removes only the highlighted span containing the target offset', () => {
    const current: HighlightRange[] = [
      { start: 0, end: 3, color: 'yellow' },
      { start: 3, end: 7, color: 'blue' },
      { start: 7, end: 10, color: 'yellow' },
    ];

    expect(removeAtOffset(current, 4)).toEqual([
      { start: 0, end: 3, color: 'yellow' },
      { start: 7, end: 10, color: 'yellow' },
    ]);
  });

  it('returns the current set unchanged when adding an invalid color', () => {
    const current: HighlightRange[] = [{ start: 1, end: 4, color: 'amber' }];
    const invalidColorRange = { start: 4, end: 6, color: 'purple' } as unknown as HighlightRange;

    expect(addRange(current, invalidColorRange, 20)).toEqual(current);
  });

  it('clears all ranges', () => {
    expect(clearRanges()).toEqual([]);
  });
});
