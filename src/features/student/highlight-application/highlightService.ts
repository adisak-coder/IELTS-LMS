import { addRange, removeAtOffset } from '../highlight-domain/highlightRangeOps';
import type {
  HighlightBlockKey,
  HighlightColor,
  HighlightSet,
} from '../highlight-domain/highlightTypes';
import type { HighlightStore } from '../highlight-infra/localHighlightStore';

export type HighlightMutationReason =
  | 'empty_selection'
  | 'invalid_bounds'
  | 'unchanged'
  | null;

export type HighlightMutationResult = {
  next: HighlightSet;
  changed: boolean;
  reason: HighlightMutationReason;
};

type SelectionInput = {
  start: number;
  end: number;
  selectedText: string;
};

function isSameSet(left: HighlightSet, right: HighlightSet): boolean {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    const a = left[index]!;
    const b = right[index]!;
    if (a.start !== b.start || a.end !== b.end || a.color !== b.color) {
      return false;
    }
  }

  return true;
}

function persistSave(store: HighlightStore, key: HighlightBlockKey, ranges: HighlightSet): void {
  try {
    store.save(key, ranges);
  } catch {
    // Never let persistence failure break runtime flow.
  }
}

function persistClear(store: HighlightStore, key: HighlightBlockKey): void {
  try {
    store.clear(key);
  } catch {
    // Never let persistence failure break runtime flow.
  }
}

export function createHighlightService(store: HighlightStore) {
  return {
    restore: ({
      key,
      blockTextLength,
    }: {
      key: HighlightBlockKey;
      blockTextLength: number;
    }): HighlightSet => {
      try {
        return store.load(key, blockTextLength) ?? [];
      } catch {
        return [];
      }
    },

    applySelection: ({
      key,
      current,
      blockTextLength,
      selection,
      color,
    }: {
      key: HighlightBlockKey;
      current: HighlightSet;
      blockTextLength: number;
      selection: SelectionInput;
      color: HighlightColor;
    }): HighlightMutationResult => {
      if (!selection.selectedText.trim()) {
        return { next: current, changed: false, reason: 'empty_selection' };
      }

      if (
        !Number.isInteger(selection.start) ||
        !Number.isInteger(selection.end) ||
        selection.start < 0 ||
        selection.end <= selection.start ||
        selection.end > blockTextLength
      ) {
        return { next: current, changed: false, reason: 'invalid_bounds' };
      }

      const next = addRange(
        current,
        { start: selection.start, end: selection.end, color },
        blockTextLength,
      );
      if (isSameSet(current, next)) {
        return { next: current, changed: false, reason: 'unchanged' };
      }

      persistSave(store, key, next);
      return { next, changed: true, reason: null };
    },

    removeAtOffset: ({
      key,
      current,
      offset,
    }: {
      key: HighlightBlockKey;
      current: HighlightSet;
      offset: number;
    }): HighlightMutationResult => {
      const next = removeAtOffset(current, offset);
      if (isSameSet(current, next)) {
        return { next: current, changed: false, reason: 'unchanged' };
      }

      if (next.length === 0) {
        persistClear(store, key);
      } else {
        persistSave(store, key, next);
      }

      return { next, changed: true, reason: null };
    },

    clear: ({
      key,
      current,
    }: {
      key: HighlightBlockKey;
      current: HighlightSet;
    }): HighlightMutationResult => {
      if (current.length === 0) {
        return { next: current, changed: false, reason: 'unchanged' };
      }

      persistClear(store, key);
      return { next: [], changed: true, reason: null };
    },
  };
}
