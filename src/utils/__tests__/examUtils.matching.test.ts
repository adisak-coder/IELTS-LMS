import { describe, expect, it } from 'vitest';
import type { MatchingBlock } from '../../types';
import { validateBlock } from '../examUtils';

describe('validateMatchingBlock', () => {
  it('errors when a paragraph has no heading selected', () => {
    const block: MatchingBlock = {
      id: 'blk-1',
      type: 'MATCHING',
      instruction: 'Choose headings',
      headings: [{ id: 'h-1', text: 'Heading 1' }],
      questions: [{ id: 'q-1', paragraphLabel: 'A', correctHeading: '' }],
    };

    const result = validateBlock(block);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'error',
          field: 'questions[0].correctHeading',
        }),
      ]),
    );
  });

  it('errors when a paragraph heading refers to a missing heading', () => {
    const block: MatchingBlock = {
      id: 'blk-1',
      type: 'MATCHING',
      instruction: 'Choose headings',
      headings: [{ id: 'h-1', text: 'Heading 1' }],
      questions: [{ id: 'q-1', paragraphLabel: 'A', correctHeading: 'ii' }],
    };

    const result = validateBlock(block);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'error',
          field: 'questions[0].correctHeading',
        }),
      ]),
    );
  });

  it('keeps unused headings as warnings', () => {
    const block: MatchingBlock = {
      id: 'blk-1',
      type: 'MATCHING',
      instruction: 'Choose headings',
      headings: [
        { id: 'h-1', text: 'Heading 1' },
        { id: 'h-2', text: 'Heading 2' },
      ],
      questions: [{ id: 'q-1', paragraphLabel: 'A', correctHeading: 'i' }],
    };

    const result = validateBlock(block);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'warning',
          field: 'headings',
        }),
      ]),
    );
  });

  it('validates inserted image URLs for supported block types', () => {
    const block: MatchingBlock = {
      id: 'blk-1',
      type: 'MATCHING',
      instruction: 'Choose headings',
      insertedImages: [{ id: 'img-1', url: '', caption: 'Context image' }],
      headings: [{ id: 'h-1', text: 'Heading 1' }],
      questions: [{ id: 'q-1', paragraphLabel: 'A', correctHeading: 'i' }],
    };

    const result = validateBlock(block);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'error',
          field: 'insertedImages[0].url',
        }),
      ]),
    );
  });

  it('skips inserted image validation for map blocks', () => {
    const result = validateBlock({
      id: 'map-1',
      type: 'MAP',
      instruction: 'Label the map.',
      insertedImages: [{ id: 'img-1', url: '', caption: 'Ignored row' }],
      assetUrl: 'https://example.com/map.png',
      questions: [{ id: 'q-1', label: 'Entrance', correctAnswer: 'A', x: 10, y: 20 }],
    } as any);

    expect(result.errors.some((error) => error.field.includes('insertedImages'))).toBe(
      false,
    );
  });
});
