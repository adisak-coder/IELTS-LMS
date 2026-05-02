import { describe, expect, it } from 'vitest';
import type { TFNGBlock } from '../../types';
import { cloneQuestionBlockWithNewIds, cloneReadingPassageWithNewIds } from '../cloneExamContent';
import { createInitialExamState } from '../../services/examAdapterService';

describe('cloneExamContent', () => {
  it('clones a question block with new nested IDs', () => {
    const block: TFNGBlock = {
      id: 'blk-1',
      type: 'TFNG',
      mode: 'TFNG',
      instruction: 'Instruction',
      insertedImages: [
        {
          id: 'img-1',
          url: 'https://example.com/context.png',
          caption: 'Context image',
        },
      ],
      questions: [{ id: 'q-1', statement: 'S', correctAnswer: 'T' }],
    };

    const cloned = cloneQuestionBlockWithNewIds(block) as TFNGBlock;

    expect(cloned).not.toBe(block);
    expect(cloned.id).not.toBe(block.id);
    expect(cloned.questions).not.toBe(block.questions);
    expect(cloned.questions[0]?.id).not.toBe(block.questions[0]?.id);
    expect(cloned.questions[0]?.statement).toBe(block.questions[0]?.statement);
    expect(cloned.insertedImages).not.toBe(block.insertedImages);
    expect(cloned.insertedImages?.[0]?.id).not.toBe(block.insertedImages?.[0]?.id);
    expect(cloned.insertedImages?.[0]?.url).toBe(block.insertedImages?.[0]?.url);
    expect(cloned.insertedImages?.[0]?.caption).toBe(block.insertedImages?.[0]?.caption);
  });

  it('clones a reading passage without shared references', () => {
    const state = createInitialExamState('Title', 'Academic', 'Academic');
    const original = state.reading.passages[0];
    original.blocks = [
      {
        id: 'blk-1',
        type: 'TFNG',
        mode: 'TFNG',
        instruction: 'Instruction',
        questions: [{ id: 'q-1', statement: 'Original', correctAnswer: 'T' }],
      },
    ];

    const cloned = cloneReadingPassageWithNewIds(original);
    const clonedBlock = cloned.blocks[0] as TFNGBlock;
    clonedBlock.questions[0]!.statement = 'Changed';

    const originalBlock = original.blocks[0] as TFNGBlock;
    expect(originalBlock.questions[0]!.statement).toBe('Original');
  });
});
