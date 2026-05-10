import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearReadingHighlightSnapshotsForAttempt,
  createLocalHighlightStore,
  toHighlightStorageKey,
} from '../localHighlightStore';
import type { HighlightBlockKey, HighlightRange } from '../../highlight-domain/highlightTypes';

describe('localHighlightStore', () => {
  const blockKey: HighlightBlockKey = {
    attemptId: 'attempt-1',
    section: 'reading',
    passageId: 'passage-a',
    blockId: 'block-1',
  };

  const ranges: HighlightRange[] = [
    { start: 2, end: 8, color: 'yellow' },
    { start: 12, end: 15, color: 'green' },
  ];

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('saves and restores v2 snapshot payload for a block key', () => {
    const store = createLocalHighlightStore();
    store.save(blockKey, ranges);

    const raw = localStorage.getItem(toHighlightStorageKey(blockKey));
    expect(raw).not.toBeNull();
    expect(raw).toContain('"version":2');

    expect(store.load(blockKey, 64)).toEqual(ranges);
  });

  it('fails closed on invalid payload by returning null and clearing corrupted data', () => {
    const key = toHighlightStorageKey(blockKey);
    localStorage.setItem(
      key,
      JSON.stringify({
        version: 2,
        updatedAt: Date.now(),
        ranges: [{ start: 100, end: 150, color: 'yellow' }],
      }),
    );

    const store = createLocalHighlightStore();
    expect(store.load(blockKey, 20)).toBeNull();
    expect(localStorage.getItem(key)).toBeNull();
  });

  it('swallows storage write errors to keep runtime flow alive', () => {
    const setItemSpy = vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });

    const store = createLocalHighlightStore();

    expect(() => store.save(blockKey, ranges)).not.toThrow();
    expect(setItemSpy).toHaveBeenCalled();
  });

  it('clears a stored snapshot', () => {
    const store = createLocalHighlightStore();
    store.save(blockKey, ranges);
    store.clear(blockKey);

    expect(localStorage.getItem(toHighlightStorageKey(blockKey))).toBeNull();
  });

  it('clears all reading snapshots for one attempt only', () => {
    const store = createLocalHighlightStore();
    store.save(blockKey, ranges);
    store.save(
      {
        ...blockKey,
        passageId: 'passage-b',
        blockId: 'block-2',
      },
      [{ start: 0, end: 2, color: 'blue' }],
    );
    store.save(
      {
        ...blockKey,
        attemptId: 'attempt-2',
      },
      [{ start: 0, end: 2, color: 'blue' }],
    );

    clearReadingHighlightSnapshotsForAttempt('attempt-1');

    expect(localStorage.getItem(toHighlightStorageKey(blockKey))).toBeNull();
    expect(
      localStorage.getItem(
        toHighlightStorageKey({
          ...blockKey,
          passageId: 'passage-b',
          blockId: 'block-2',
        }),
      ),
    ).toBeNull();
    expect(
      localStorage.getItem(
        toHighlightStorageKey({
          ...blockKey,
          attemptId: 'attempt-2',
        }),
      ),
    ).not.toBeNull();
  });
});
