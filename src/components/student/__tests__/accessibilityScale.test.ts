import { describe, expect, it } from 'vitest';
import {
  canDecreaseStudentPassageReadability,
  canIncreaseStudentPassageReadability,
  clampStudentPassageReadabilityLevel,
  DEFAULT_STUDENT_PASSAGE_READABILITY_LEVEL,
  getStudentFontSizeLabel,
  getStudentPassageReadabilityLabel,
  getStudentReadingTypographyScale,
  getStudentTypographyScale,
} from '../accessibilityScale';

describe('student accessibility scale', () => {
  it('returns progressively larger typography tokens for each font size', () => {
    const small = getStudentTypographyScale('small');
    const normal = getStudentTypographyScale('normal');
    const large = getStudentTypographyScale('large');

    expect(small.fontScale).toBeLessThan(normal.fontScale);
    expect(normal.fontScale).toBeLessThan(large.fontScale);
    expect(small.rootFontSize).toContain('clamp');
    expect(normal.rootFontSize).toContain('clamp');
    expect(large.rootFontSize).toContain('clamp');
    expect(small.controlFontSize).not.toBe(large.controlFontSize);
    expect(normal.chipFontSize).not.toBe(small.chipFontSize);
    expect(small.passageFontSize).not.toBe(normal.passageFontSize);
    expect(normal.passageFontSize).not.toBe(large.passageFontSize);
    expect(small.passageLineHeight).toBeLessThan(normal.passageLineHeight);
    expect(normal.passageLineHeight).toBeLessThan(large.passageLineHeight);
    expect(large.passageH1FontSize).toContain('clamp');
    expect(getStudentFontSizeLabel('normal')).toBe('Medium');
  });

  it('computes comfort-first reading typography with clamped readability controls', () => {
    const base = getStudentTypographyScale('normal');
    const compact = getStudentReadingTypographyScale(base, 0);
    const comfort = getStudentReadingTypographyScale(base, DEFAULT_STUDENT_PASSAGE_READABILITY_LEVEL);
    const extraLarge = getStudentReadingTypographyScale(base, 3);

    expect(compact.passageFontSize).toContain('calc');
    expect(comfort.passageFontSize).toContain('calc');
    expect(extraLarge.passageFontSize).toContain('calc');
    expect(compact.passageLineHeight).toBeLessThan(comfort.passageLineHeight);
    expect(comfort.passageLineHeight).toBeLessThan(extraLarge.passageLineHeight);
    expect(compact.questionLineHeight).toBeLessThan(comfort.questionLineHeight);
    expect(comfort.questionLineHeight).toBeLessThan(extraLarge.questionLineHeight);
    expect(getStudentPassageReadabilityLabel(DEFAULT_STUDENT_PASSAGE_READABILITY_LEVEL)).toBe('Comfort');
    expect(clampStudentPassageReadabilityLevel(-10)).toBe(0);
    expect(clampStudentPassageReadabilityLevel(99)).toBe(3);
    expect(canIncreaseStudentPassageReadability(2)).toBe(true);
    expect(canIncreaseStudentPassageReadability(3)).toBe(false);
    expect(canDecreaseStudentPassageReadability(1)).toBe(true);
    expect(canDecreaseStudentPassageReadability(0)).toBe(false);
  });
});
