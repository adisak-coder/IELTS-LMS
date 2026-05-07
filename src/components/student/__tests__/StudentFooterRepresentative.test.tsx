import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { StudentFooter } from '../StudentFooter';

describe('StudentFooter', () => {
  it('navigates using the active root slot representative question id', () => {
    const onNavigate = vi.fn();

    render(
      <StudentFooter
        questions={[
          {
            id: 'q1',
            rootId: 'root-1',
            rootNumber: 1,
            blockId: 'block-1',
            groupId: 'group-1',
            groupLabel: 'Section 1',
            isMulti: false,
            correctCount: 1,
          },
          {
            id: 'q2',
            rootId: 'root-1',
            rootNumber: 1,
            blockId: 'block-1',
            groupId: 'group-1',
            groupLabel: 'Section 1',
            isMulti: false,
            correctCount: 1,
          },
        ]}
        currentQuestionId="q2"
        onNavigate={onNavigate}
        answers={{}}
        onSubmit={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '1' }));
    expect(onNavigate).toHaveBeenCalledWith('q2');
  });
});

