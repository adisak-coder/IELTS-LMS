import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { StudentFooter } from '../StudentFooter';

describe('StudentFooter', () => {
  it('navigates when selecting a question chip', () => {
    const onNavigate = vi.fn();

    render(
      <StudentFooter
        questions={[
          {
            id: 'q1',
            blockId: 'block-1',
            groupId: 'group-1',
            groupLabel: 'Section 1',
            isMulti: false,
            correctCount: 1,
            answerKey: 'q1',
            block: {} as any,
            question: null,
          },
          {
            id: 'q2',
            blockId: 'block-1',
            groupId: 'group-1',
            groupLabel: 'Section 1',
            isMulti: false,
            correctCount: 1,
            answerKey: 'q2',
            block: {} as any,
            question: null,
          },
        ]}
        currentQuestionId="q2"
        onNavigate={onNavigate}
        answers={{}}
        onSubmit={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '2' }));
    expect(onNavigate).toHaveBeenCalledWith('q2');
  });
});
