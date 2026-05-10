import { highlightColors, type HighlightColor, type HighlightRange } from './highlightTypes';

const highlightColorSet = new Set<string>(highlightColors);

export function isHighlightColor(value: unknown): value is HighlightColor {
  return typeof value === 'string' && highlightColorSet.has(value);
}

export function isValidHighlightRange(range: HighlightRange, blockTextLength: number): boolean {
  return (
    Number.isInteger(range.start) &&
    Number.isInteger(range.end) &&
    range.start >= 0 &&
    range.end > range.start &&
    range.end <= blockTextLength &&
    isHighlightColor(range.color)
  );
}
