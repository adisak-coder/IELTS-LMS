import React, { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { QuestionBuilderPane } from '../QuestionBuilderPane';

vi.mock('../blocks/TFNGBlock', () => ({
  TFNGBlock: ({ block, deleteBlock }: any) => (
    <div data-testid="tfng-block">
      <span data-testid="tfng-count">{block.questions.length}</span>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          deleteBlock(block.id);
        }}
      >
        Delete block
      </button>
    </div>
  ),
}));

vi.mock('../blocks/MapLabelingBlock', () => ({
  MapLabelingBlock: () => <div data-testid="map-block" />,
}));

describe('QuestionBuilderPane', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows inline add question controls for supported block types', () => {
    render(
      <QuestionBuilderPane
        title="Reading"
        blocks={[
          {
            id: 'block-1',
            type: 'TFNG',
            mode: 'TFNG',
            instruction: 'Read and answer',
            questions: [{ id: 'q-1', statement: 'Statement', correctAnswer: 'T' }],
          } as any,
        ]}
        updateBlocks={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /^add question$/i })).toBeTruthy();
  });

  it('hides inline add question controls for unsupported block types', () => {
    render(
      <QuestionBuilderPane
        title="Reading"
        blocks={[
          {
            id: 'block-1',
            type: 'MAP',
            instruction: 'Label the map',
            questions: [{ id: 'q-1', label: 'A', correctAnswer: '', x: 50, y: 50 }],
          } as any,
        ]}
        updateBlocks={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: /^add question$/i })).toBeNull();
  });

  it('keeps rapid add-question clicks in sync with the latest block state', async () => {
    function Harness() {
      const [blocks, setBlocks] = useState([
        {
          id: 'block-1',
          type: 'TFNG',
          mode: 'TFNG',
          instruction: 'Read and answer',
          questions: [{ id: 'q-1', statement: 'Statement', correctAnswer: 'T' }],
        } as any,
      ]);

      return <QuestionBuilderPane title="Reading" blocks={blocks} updateBlocks={setBlocks} />;
    }

    render(<Harness />);

    const addQuestionButton = screen.getByRole('button', { name: /^add question$/i });

    await act(async () => {
      fireEvent.click(addQuestionButton);
      fireEvent.click(addQuestionButton);
    });

    await waitFor(() => {
      expect(screen.getByTestId('tfng-count')).toHaveTextContent('3');
    });
  });

  it('inline add question for SINGLE_MCQ appends a question entry instead of adding options', async () => {
    function Harness() {
      const [blocks, setBlocks] = useState([
        {
          id: 'single-block-1',
          type: 'SINGLE_MCQ',
          instruction: 'Choose one answer for each question.',
          stem: 'Legacy stem',
          options: [
            { id: 'legacy-a', text: 'Legacy A', isCorrect: true },
            { id: 'legacy-b', text: 'Legacy B', isCorrect: false },
          ],
          questions: [
            {
              id: 'single-q1',
              stem: 'Question 1',
              options: [
                { id: 'q1-a', text: 'A', isCorrect: true },
                { id: 'q1-b', text: 'B', isCorrect: false },
                { id: 'q1-c', text: 'C', isCorrect: false },
              ],
            },
          ],
        } as any,
      ]);

      const singleBlock = blocks[0] as any;
      return (
        <>
          <QuestionBuilderPane title="Reading" blocks={blocks} updateBlocks={setBlocks} />
          <div data-testid="single-question-count">{singleBlock.questions?.length ?? 0}</div>
          <div data-testid="single-first-option-count">{singleBlock.questions?.[0]?.options?.length ?? 0}</div>
        </>
      );
    }

    render(<Harness />);

    const addQuestionButtons = screen.getAllByRole('button', { name: /^add question$/i });
    fireEvent.click(addQuestionButtons[1]!);

    await waitFor(() => {
      expect(screen.getByTestId('single-question-count')).toHaveTextContent('2');
    });
    expect(screen.getByTestId('single-first-option-count')).toHaveTextContent('3');
  });

  it('clears a deleted selection before saving a block to the bank', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined);

    function Harness() {
      const [blocks, setBlocks] = useState([
        {
          id: 'block-1',
          type: 'TFNG',
          mode: 'TFNG',
          instruction: 'Read and answer',
          questions: [{ id: 'q-1', statement: 'Statement', correctAnswer: 'T' }],
        } as any,
      ]);

      return <QuestionBuilderPane title="Reading" blocks={blocks} updateBlocks={setBlocks} />;
    }

    render(<Harness />);

    fireEvent.click(screen.getByTestId('tfng-block'));
    fireEvent.click(screen.getByRole('button', { name: /delete block/i }));
    fireEvent.click(screen.getByRole('button', { name: /save to bank/i }));

    expect(alertSpy).toHaveBeenCalledWith('Please select a question block first by clicking on it.');
    alertSpy.mockRestore();
  });

  it('keeps full legacy question range visible after adding sub-answer from a row icon', async () => {
    function Harness() {
      const [blocks, setBlocks] = useState([
        {
          id: 'block-cloze',
          type: 'CLOZE',
          instruction: 'Answer questions 14-19',
          answerRule: 'TWO_WORDS',
          questions: [
            { id: 'q-18', prompt: 'Q18', correctAnswer: 'a' },
            { id: 'q-19', prompt: 'Q19', correctAnswer: 'b' },
            { id: 'q-20', prompt: 'Q20', correctAnswer: 'c' },
            { id: 'q-21', prompt: 'Q21', correctAnswer: 'd' },
            { id: 'q-22', prompt: 'Q22', correctAnswer: 'e' },
            { id: 'q-23', prompt: 'Q23', correctAnswer: 'f' },
          ],
          subAnswerModeEnabled: true,
          answerTree: [
            {
              id: 'root-18',
              children: [{ id: 'leaf-18', label: 'Leaf 18', acceptedAnswers: ['a'], required: true }],
            },
          ],
        } as any,
      ]);

      return <QuestionBuilderPane title="Reading" blocks={blocks} updateBlocks={setBlocks} startNumber={18} />;
    }

    render(<Harness />);

    expect(screen.getByText('Questions 18-23')).toBeInTheDocument();
    fireEvent.click(screen.getAllByTitle('Add sub-answer')[0]!);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Sub-answer prompt')).toBeInTheDocument();
      expect(screen.getByText('Questions 18-23')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Q19')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Q23')).toBeInTheDocument();
    });
  });

});
