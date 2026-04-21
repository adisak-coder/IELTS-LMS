import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ExamBulkActionBar } from '../ExamBulkActionBar';

describe('ExamBulkActionBar', () => {
  it('renders Delete when handler is provided and calls it on click', () => {
    const onBulkDelete = vi.fn().mockResolvedValue(undefined);

    render(
      <ExamBulkActionBar
        selectedCount={2}
        onClearSelection={() => {}}
        onBulkDelete={onBulkDelete}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onBulkDelete).toHaveBeenCalledTimes(1);
  });

  it('does not render Delete when handler is not provided', () => {
    render(<ExamBulkActionBar selectedCount={1} onClearSelection={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
  });
});

