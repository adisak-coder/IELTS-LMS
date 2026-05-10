import { isValidHighlightRange } from '../highlight-domain/highlightInvariants';
import type { HighlightRange, HighlightSet } from '../highlight-domain/highlightTypes';

const SNAPSHOT_VERSION = 2;

type HighlightSnapshotPayload = {
  version: number;
  updatedAt: number;
  ranges: HighlightRange[];
};

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isStrictNormalizedSet(ranges: HighlightRange[], blockTextLength: number): boolean {
  for (let index = 0; index < ranges.length; index += 1) {
    const current = ranges[index]!;
    if (!isValidHighlightRange(current, blockTextLength)) {
      return false;
    }
    if (index === 0) {
      continue;
    }
    const previous = ranges[index - 1]!;
    if (current.start < previous.end) {
      return false;
    }
  }
  return true;
}

export function encodeHighlightSnapshot(ranges: HighlightSet): string {
  const payload: HighlightSnapshotPayload = {
    version: SNAPSHOT_VERSION,
    updatedAt: Date.now(),
    ranges,
  };
  return JSON.stringify(payload);
}

export function decodeHighlightSnapshot(
  rawPayload: string,
  blockTextLength: number,
): HighlightSet | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawPayload);
  } catch {
    return null;
  }

  if (!isObjectLike(parsed)) {
    return null;
  }

  if (parsed['version'] !== SNAPSHOT_VERSION) {
    return null;
  }

  if (!Number.isFinite(parsed['updatedAt'])) {
    return null;
  }

  if (!Array.isArray(parsed['ranges'])) {
    return null;
  }

  const ranges: HighlightRange[] = [];
  for (const item of parsed['ranges']) {
    if (!isObjectLike(item)) {
      return null;
    }
    const candidate: HighlightRange = {
      start: item['start'] as number,
      end: item['end'] as number,
      color: item['color'] as HighlightRange['color'],
    };
    ranges.push(candidate);
  }

  if (!isStrictNormalizedSet(ranges, blockTextLength)) {
    return null;
  }

  return ranges.map((range) => ({ ...range }));
}
