import { describe, expect, it } from 'vitest';
import { compareFreshnessDimension, mergeLiveSnapshotFreshness } from '../liveSnapshotFreshness';

describe('liveSnapshotFreshness', () => {
  it('treats higher revisions as fresher', () => {
    expect(
      compareFreshnessDimension(
        { revision: 2, updatedAtMs: 0 },
        { revision: 1, updatedAtMs: 999999 },
      ),
    ).toBe(1);
  });

  it('never lets a revisionless snapshot override a revisioned snapshot', () => {
    expect(
      compareFreshnessDimension(
        { revision: null, updatedAtMs: Date.parse('2026-01-01T00:00:10.000Z') },
        { revision: 5, updatedAtMs: Date.parse('2026-01-01T00:00:00.000Z') },
      ),
    ).toBe(-1);
  });

  it('falls back to updatedAtMs when both revisions are missing', () => {
    expect(
      compareFreshnessDimension(
        { revision: null, updatedAtMs: 200 },
        { revision: null, updatedAtMs: 100 },
      ),
    ).toBe(1);
  });

  it('merges per-dimension based on apply flags', () => {
    const prev = {
      attempt: { revision: 10, updatedAtMs: 10 },
      runtime: { revision: 20, updatedAtMs: 20 },
    };
    const incoming = {
      attempt: { revision: 11, updatedAtMs: 11 },
      runtime: { revision: 21, updatedAtMs: 21 },
    };

    expect(mergeLiveSnapshotFreshness(prev, incoming, { applyAttempt: false, applyRuntime: true })).toEqual({
      attempt: prev.attempt,
      runtime: incoming.runtime,
    });
  });
});

