import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Header } from '../Header';
import { createInitialExamState } from '../../services/examAdapterService';

describe('Header', () => {
  it('keeps config.general.title in sync when editing the exam title', () => {
    const state = createInitialExamState('Old', 'Academic');
    const onUpdateState = vi.fn();

    render(
      <Header
        state={state}
        onUpdateState={onUpdateState}
        onReturnToAdmin={() => {}}
        onNavigateToConfig={() => {}}
        onNavigateToReview={() => {}}
      />,
    );

    fireEvent.change(screen.getByLabelText(/exam title/i), { target: { value: 'New Title' } });

    expect(onUpdateState).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'New Title',
        config: expect.objectContaining({
          general: expect.objectContaining({
            title: 'New Title',
          }),
        }),
      }),
    );
  });
});

