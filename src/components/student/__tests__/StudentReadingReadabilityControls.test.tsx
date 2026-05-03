import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ExamState } from '../../../types';
import { StudentReading } from '../StudentReading';

function createState(): ExamState {
  return {
    title: 'Reading Test',
    type: 'Academic',
    activeModule: 'reading',
    activePassageId: 'passage-1',
    activeListeningPartId: 'part-1',
    config: {
      type: 'Academic',
      delivery: {
        launchMode: 'proctor_start',
        transitionMode: 'auto_with_proctor_override',
        allowedExtensionMinutes: [5],
      },
      sections: {
        listening: {
          enabled: false,
          order: 1,
          duration: 30,
          autoContinue: true,
          allowedQuestionTypes: ['SHORT_ANSWER'],
        },
        reading: {
          enabled: true,
          order: 2,
          duration: 60,
          autoContinue: true,
          allowedQuestionTypes: ['SHORT_ANSWER'],
        },
        writing: {
          enabled: false,
          order: 3,
          duration: 60,
          autoContinue: true,
          allowedQuestionTypes: ['SHORT_ANSWER'],
        },
        speaking: {
          enabled: false,
          order: 4,
          duration: 15,
          autoContinue: true,
          allowedQuestionTypes: ['SHORT_ANSWER'],
        },
      },
    },
    reading: {
      passages: [
        {
          id: 'passage-1',
          title: 'Passage 1',
          content: 'First paragraph. Second sentence.',
          images: [],
          blocks: [
            {
              id: 'q-block',
              type: 'SHORT_ANSWER',
              instruction: 'Answer the question.',
              questions: [
                {
                  id: 'q1',
                  prompt: 'What is the answer?',
                  correctAnswer: 'answer',
                  answerRule: 'ONE_WORD',
                },
              ],
            },
          ],
        },
      ],
    },
    listening: { parts: [] },
    writing: { task1Prompt: '', task2Prompt: '' },
    speaking: { part1Topics: [], cueCard: '', part3Discussion: [] },
  } as ExamState;
}

describe('StudentReading passage readability controls', () => {
  it('renders in-pane controls and invokes handlers', () => {
    const onIncrease = vi.fn();
    const onDecrease = vi.fn();
    const onReset = vi.fn();

    render(
      <StudentReading
        state={createState()}
        answers={{}}
        onAnswerChange={() => {}}
        currentQuestionId="q1"
        onNavigate={() => {}}
        onIncreasePassageReadability={onIncrease}
        onDecreasePassageReadability={onDecrease}
        onResetPassageReadability={onReset}
        passageReadabilityLabel="Comfort"
        canIncreasePassageReadability
        canDecreasePassageReadability
      />,
    );

    expect(screen.getByTestId('passage-readability-controls')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /increase passage text size/i }));
    fireEvent.click(screen.getByRole('button', { name: /decrease passage text size/i }));
    fireEvent.click(screen.getByRole('button', { name: /reset passage readability/i }));

    expect(onIncrease).toHaveBeenCalledTimes(1);
    expect(onDecrease).toHaveBeenCalledTimes(1);
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('clamps controls via disabled state and applies question readability css vars', () => {
    render(
      <StudentReading
        state={createState()}
        answers={{}}
        onAnswerChange={() => {}}
        currentQuestionId="q1"
        onNavigate={() => {}}
        onIncreasePassageReadability={vi.fn()}
        onDecreasePassageReadability={vi.fn()}
        onResetPassageReadability={vi.fn()}
        passageReadabilityLabel="Extra Large"
        canIncreasePassageReadability={false}
        canDecreasePassageReadability={false}
      />,
    );

    expect(screen.getByRole('button', { name: /increase passage text size/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /decrease passage text size/i })).toBeDisabled();

    const questionPane = screen.getByTestId('reading-question-scroll');
    expect(questionPane).toHaveStyle({
      fontSize: 'var(--student-reading-question-font-size)',
      lineHeight: 'var(--student-reading-question-line-height)',
    });
  });
});
