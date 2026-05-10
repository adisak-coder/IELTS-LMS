import { describe, expect, it, vi } from 'vitest';
import { createHighlightService } from '../highlightService';
import type { HighlightBlockKey, HighlightSet } from '../../highlight-domain/highlightTypes';
import type { HighlightStore } from '../../highlight-infra/localHighlightStore';

function createStoreMock(initialLoad: HighlightSet | null = null): HighlightStore {
  return {
    load: vi.fn(() => initialLoad),
    save: vi.fn(),
    clear: vi.fn(),
  };
}

describe('highlightService', () => {
  const key: HighlightBlockKey = {
    attemptId: 'attempt-42',
    section: 'reading',
    passageId: 'passage-1',
    blockId: 'block-1',
  };

  it('restores ranges from store or falls back to empty set', () => {
    const restored: HighlightSet = [{ start: 1, end: 5, color: 'yellow' }];
    const service = createHighlightService(createStoreMock(restored));

    expect(service.restore({ key, blockTextLength: 32 })).toEqual(restored);

    const emptyService = createHighlightService(createStoreMock(null));
    expect(emptyService.restore({ key, blockTextLength: 32 })).toEqual([]);
  });

  it('applies valid selection, persists result, and marks mutation as changed', () => {
    const store = createStoreMock();
    const service = createHighlightService(store);
    const current: HighlightSet = [{ start: 0, end: 4, color: 'yellow' }];

    const result = service.applySelection({
      key,
      current,
      blockTextLength: 40,
      selection: {
        start: 4,
        end: 9,
        selectedText: 'beta',
      },
      color: 'green',
    });

    expect(result.changed).toBe(true);
    expect(result.reason).toBeNull();
    expect(result.next).toEqual([
      { start: 0, end: 4, color: 'yellow' },
      { start: 4, end: 9, color: 'green' },
    ]);
    expect(store.save).toHaveBeenCalledWith(key, result.next);
  });

  it('returns no-op for whitespace-only selection and does not persist', () => {
    const store = createStoreMock();
    const service = createHighlightService(store);
    const current: HighlightSet = [{ start: 3, end: 6, color: 'amber' }];

    const result = service.applySelection({
      key,
      current,
      blockTextLength: 40,
      selection: {
        start: 6,
        end: 9,
        selectedText: '   ',
      },
      color: 'blue',
    });

    expect(result.changed).toBe(false);
    expect(result.reason).toBe('empty_selection');
    expect(result.next).toEqual(current);
    expect(store.save).not.toHaveBeenCalled();
  });

  it('removes only the range at offset and persists the next set', () => {
    const store = createStoreMock();
    const service = createHighlightService(store);
    const current: HighlightSet = [
      { start: 0, end: 3, color: 'yellow' },
      { start: 3, end: 8, color: 'blue' },
    ];

    const result = service.removeAtOffset({ key, current, offset: 5 });
    expect(result.changed).toBe(true);
    expect(result.next).toEqual([{ start: 0, end: 3, color: 'yellow' }]);
    expect(store.save).toHaveBeenCalledWith(key, result.next);
  });

  it('clears ranges and calls store.clear', () => {
    const store = createStoreMock();
    const service = createHighlightService(store);
    const current: HighlightSet = [{ start: 0, end: 2, color: 'yellow' }];

    const result = service.clear({ key, current });
    expect(result.changed).toBe(true);
    expect(result.next).toEqual([]);
    expect(store.clear).toHaveBeenCalledWith(key);
  });

  it('swallows persistence errors and still returns the in-memory mutation', () => {
    const store: HighlightStore = {
      load: vi.fn(() => null),
      save: vi.fn(() => {
        throw new Error('quota');
      }),
      clear: vi.fn(),
    };
    const service = createHighlightService(store);

    const result = service.applySelection({
      key,
      current: [],
      blockTextLength: 40,
      selection: {
        start: 2,
        end: 6,
        selectedText: 'test',
      },
      color: 'green',
    });

    expect(result.changed).toBe(true);
    expect(result.next).toEqual([{ start: 2, end: 6, color: 'green' }]);
  });
});
