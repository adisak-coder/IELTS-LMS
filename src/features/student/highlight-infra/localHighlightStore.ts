import type { HighlightBlockKey, HighlightSet } from '../highlight-domain/highlightTypes';
import { decodeHighlightSnapshot, encodeHighlightSnapshot } from './highlightSnapshotCodec';

const HIGHLIGHT_STORAGE_PREFIX = 'ielts:highlight:v2';

function getStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function toHighlightStorageKey(key: HighlightBlockKey): string {
  return `${HIGHLIGHT_STORAGE_PREFIX}:${key.attemptId}:reading:${key.passageId}:${key.blockId}`;
}

export function clearReadingHighlightSnapshotsForAttempt(attemptId: string): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }
  const prefix = `${HIGHLIGHT_STORAGE_PREFIX}:${attemptId}:reading:`;
  try {
    for (let index = storage.length - 1; index >= 0; index -= 1) {
      const key = storage.key(index);
      if (key?.startsWith(prefix)) {
        storage.removeItem(key);
      }
    }
  } catch {
    // Ignore storage clear errors.
  }
}

export interface HighlightStore {
  load: (key: HighlightBlockKey, blockTextLength: number) => HighlightSet | null;
  save: (key: HighlightBlockKey, ranges: HighlightSet) => void;
  clear: (key: HighlightBlockKey) => void;
}

export function createLocalHighlightStore(): HighlightStore {
  return {
    load: (key, blockTextLength) => {
      const storage = getStorage();
      if (!storage) {
        return null;
      }

      const storageKey = toHighlightStorageKey(key);
      const raw = storage.getItem(storageKey);
      if (!raw) {
        return null;
      }

      const decoded = decodeHighlightSnapshot(raw, blockTextLength);
      if (!decoded) {
        try {
          storage.removeItem(storageKey);
        } catch {
          // Ignore invalid payload cleanup errors.
        }
        return null;
      }

      return decoded;
    },
    save: (key, ranges) => {
      const storage = getStorage();
      if (!storage) {
        return;
      }

      const storageKey = toHighlightStorageKey(key);
      try {
        if (ranges.length === 0) {
          storage.removeItem(storageKey);
          return;
        }
        storage.setItem(storageKey, encodeHighlightSnapshot(ranges));
      } catch {
        // Storage errors must not block exam flow.
      }
    },
    clear: (key) => {
      const storage = getStorage();
      if (!storage) {
        return;
      }
      try {
        storage.removeItem(toHighlightStorageKey(key));
      } catch {
        // Ignore storage clear errors.
      }
    },
  };
}
