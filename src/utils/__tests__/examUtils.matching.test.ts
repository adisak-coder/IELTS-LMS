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
});

