import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ReadingHighlightView } from '../ReadingHighlightView';

describe('ReadingHighlightView', () => {
  it('renders read-only passage content', () => {
    render(
      <ReadingHighlightView
        content="Alpha beta gamma"
        ranges={[]}
      />,
    );

    expect(screen.getByText('Alpha beta gamma')).toBeInTheDocument();
  });

  it('renders highlight decorations from structured ranges', () => {
    const { container } = render(
      <ReadingHighlightView
        content="Alpha beta gamma"
        ranges={[{ start: 6, end: 10, color: 'yellow' }]}
      />,
    );

    const highlighted = container.querySelectorAll('[data-highlighted="true"]');
    expect(highlighted.length).toBeGreaterThan(0);
    expect(highlighted[0]).toHaveTextContent('beta');
    expect(highlighted[0]).toHaveAttribute('data-highlight-color', 'yellow');
  });
});
