import { isValidHighlightRange } from './highlightInvariants';
import type { HighlightRange, HighlightSet } from './highlightTypes';

function mergeAdjacentSameColor(ranges: HighlightSet): HighlightSet {
  if (ranges.length === 0) {
    return [];
  }

  const sorted = [...ranges].sort((left, right) => left.start - right.start);
  const merged: HighlightSet = [sorted[0]!];

  for (let index = 1; index < sorted.length; index += 1) {
    const current = sorted[index]!;
    const previous = merged[merged.length - 1]!;

    if (previous.color === current.color && previous.end >= current.start) {
      previous.end = Math.max(previous.end, current.end);
      continue;
    }

    merged.push({ ...current });
  }

  return merged;
}

export function addRange(
  current: HighlightSet,
  next: HighlightRange,
  blockTextLength: number,
): HighlightSet {
  if (!isValidHighlightRange(next, blockTextLength)) {
    return current.map((range) => ({ ...range }));
  }

  const withoutOverlap: HighlightSet = [];
  for (const existing of current) {
    if (existing.end <= next.start || existing.start >= next.end) {
      withoutOverlap.push({ ...existing });
      continue;
    }

    if (existing.start < next.start) {
      withoutOverlap.push({
        start: existing.start,
        end: next.start,
        color: existing.color,
      });
    }

    if (existing.end > next.end) {
      withoutOverlap.push({
        start: next.end,
        end: existing.end,
        color: existing.color,
      });
    }
  }

  withoutOverlap.push({ ...next });
  return mergeAdjacentSameColor(withoutOverlap);
}

export function normalizeRanges(input: HighlightRange[], blockTextLength: number): HighlightSet {
  let ranges: HighlightSet = [];
  for (const range of input) {
    ranges = addRange(ranges, range, blockTextLength);
  }
  return ranges;
}

export function removeAtOffset(current: HighlightSet, offset: number): HighlightSet {
  return current
    .filter((range) => !(offset >= range.start && offset < range.end))
    .map((range) => ({ ...range }));
}

export function clearRanges(): HighlightSet {
  return [];
}
