import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useReadingHighlightController } from '../useReadingHighlightController';
import type { HighlightBlockKey, HighlightSet } from '../../highlight-domain/highlightTypes';
import type { HighlightStore } from '../../highlight-infra/localHighlightStore';

function createStoreMock(initialLoad: HighlightSet | null): HighlightStore {
  return {
    load: vi.fn(() => initialLoad),
    save: vi.fn(),
    clear: vi.fn(),
  };
}

describe('useReadingHighlightController', () => {
  const key: HighlightBlockKey = {
    attemptId: 'attempt-9',
    section: 'reading',
    passageId: 'passage-9',
    blockId: 'block-9',
  };

  it('restores persisted ranges on mount', () => {
    const store = createStoreMock([{ start: 1, end: 4, color: 'yellow' }]);
    const { result } = renderHook(() =>
      useReadingHighlightController({
        key,
        blockTextLength: 20,
        color: 'yellow',
        store,
      }),
    );

    expect(result.current.ranges).toEqual([{ start: 1, end: 4, color: 'yellow' }]);
  });

  it('applies a selection and updates in-memory ranges', () => {
    const store = createStoreMock(null);
    const { result } = renderHook(() =>
      useReadingHighlightController({
        key,
        blockTextLength: 20,
        color: 'green',
        store,
      }),
    );

    act(() => {
      result.current.applySelection({
        start: 2,
        end: 6,
        selectedText: 'beta',
      });
    });

    expect(result.current.ranges).toEqual([{ start: 2, end: 6, color: 'green' }]);
    expect(result.current.lastReason).toBeNull();
  });

  it('returns reason for empty selection and leaves ranges unchanged', () => {
    const store = createStoreMock([{ start: 2, end: 6, color: 'green' }]);
    const { result } = renderHook(() =>
      useReadingHighlightController({
        key,
        blockTextLength: 20,
        color: 'green',
        store,
      }),
    );

    act(() => {
      result.current.applySelection({
        start: 8,
        end: 10,
        selectedText: '   ',
      });
    });

    expect(result.current.lastReason).toBe('empty_selection');
    expect(result.current.ranges).toEqual([{ start: 2, end: 6, color: 'green' }]);
  });

  it('removes only target range by offset and can clear all ranges', () => {
    const store = createStoreMock([
      { start: 0, end: 3, color: 'yellow' },
      { start: 3, end: 7, color: 'blue' },
    ]);
    const { result } = renderHook(() =>
      useReadingHighlightController({
        key,
        blockTextLength: 20,
        color: 'blue',
        store,
      }),
    );

    act(() => {
      result.current.removeAtOffset(4);
    });

    expect(result.current.ranges).toEqual([{ start: 0, end: 3, color: 'yellow' }]);

    act(() => {
      result.current.clear();
    });

    expect(result.current.ranges).toEqual([]);
  });
});
