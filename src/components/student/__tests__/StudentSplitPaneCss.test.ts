import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('student reading and writing split-pane CSS', () => {
  const css = readFileSync(resolve(__dirname, '../../../index.css'), 'utf8');

  it('keeps the adaptive workspace horizontal instead of stacking panes', () => {
    expect(css).not.toContain('.student-adaptive-workspace {\n    flex-direction: column;');
    expect(css).toContain('.student-adaptive-workspace {\n    flex-direction: row;');
  });

  it('shows the draggable separator at all viewport sizes', () => {
    expect(css).not.toContain('.student-pane-separator {\n    display: none;');
    expect(css).toContain('.student-pane-separator {\n    display: flex;');
  });
});
