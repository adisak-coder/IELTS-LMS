import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { RichTextHighlighter } from '../RichTextHighlighter';

describe('RichTextHighlighter user-select', () => {
  it('sets userSelect:text when enabled=true', () => {
    const { container } = render(
      <RichTextHighlighter
        content="<p>Hello world</p>"
        contentType="html"
        enabled
      />,
    );

    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper).not.toBeNull();
    expect(wrapper.style.userSelect).toBe('text');
  });

  it('sets userSelect:text even when enabled=false so passage text remains selectable', () => {
    const { container } = render(
      <RichTextHighlighter
        content="<p>Hello world</p>"
        contentType="html"
        enabled={false}
      />,
    );

    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper).not.toBeNull();
    expect(wrapper.style.userSelect).toBe('text');
  });
});
