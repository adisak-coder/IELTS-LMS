import React, { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { SingleMCQBlock as SingleMCQBlockType } from '../../../types';
import { SingleMCQBlock } from '../SingleMCQBlock';

function Harness({ initialBlock }: { initialBlock: SingleMCQBlockType }) {
  const [block, setBlock] = useState<SingleMCQBlockType>(initialBlock);

  return (
    <SingleMCQBlock
      block={block}
      startNum={8}
      endNum={8 + ((block.questions?.length ?? 1) - 1)}
      updateBlock={setBlock}
      deleteBlock={() => {}}
      moveBlock={() => {}}
      errors={[]}
    />
  );
}

describe('SingleMCQBlock', () => {
  it('block-local Add Question appends a new question entry', () => {
    const initialBlock: SingleMCQBlockType = {
      id: 'single-block-1',
      type: 'SINGLE_MCQ',
      instruction: 'Choose one answer.',
      stem: 'Legacy stem',
      options: [
        { id: 'legacy-a', text: 'Legacy A', isCorrect: true },
        { id: 'legacy-b', text: 'Legacy B', isCorrect: false },
      ],
      questions: [
        {
          id: 'single-q1',
          stem: 'First stem',
          options: [
            { id: 'q1-a', text: 'One-A', isCorrect: true },
            { id: 'q1-b', text: 'One-B', isCorrect: false },
          ],
        },
      ],
    };

    render(<Harness initialBlock={initialBlock} />);

    expect(screen.getByText('Questions (1)')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^add question$/i }));
    expect(screen.getByText('Questions (2)')).toBeInTheDocument();
  });

  it('Add Option only affects the targeted question', () => {
    const initialBlock: SingleMCQBlockType = {
      id: 'single-block-2',
      type: 'SINGLE_MCQ',
      instruction: 'Choose one answer.',
      stem: 'Legacy stem',
      options: [
        { id: 'legacy-a', text: 'Legacy A', isCorrect: true },
        { id: 'legacy-b', text: 'Legacy B', isCorrect: false },
      ],
      questions: [
        {
          id: 'single-q1',
          stem: 'First stem',
          options: [
            { id: 'q1-a', text: 'One-A', isCorrect: true },
            { id: 'q1-b', text: 'One-B', isCorrect: false },
          ],
        },
        {
          id: 'single-q2',
          stem: 'Second stem',
          options: [
            { id: 'q2-a', text: 'Two-A', isCorrect: true },
            { id: 'q2-b', text: 'Two-B', isCorrect: false },
          ],
        },
      ],
    };

    render(<Harness initialBlock={initialBlock} />);

    const firstStemArea = screen.getByDisplayValue('First stem');
    const secondStemArea = screen.getByDisplayValue('Second stem');
    const firstCard = firstStemArea.closest('div.border.rounded-md.p-4');
    const secondCard = secondStemArea.closest('div.border.rounded-md.p-4');

    expect(firstCard).not.toBeNull();
    expect(secondCard).not.toBeNull();

    const addOptionButtons = screen.getAllByRole('button', { name: /^add option$/i });
    fireEvent.click(addOptionButtons[1]!);

    expect(within(firstCard as HTMLElement).getAllByPlaceholderText('Option text...')).toHaveLength(2);
    expect(within(secondCard as HTMLElement).getAllByPlaceholderText('Option text...')).toHaveLength(3);
  });
});
