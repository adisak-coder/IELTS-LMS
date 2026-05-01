import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDefaultConfig } from '../../../constants/examDefaults';
import type { ExamState } from '../../../types';
import { StudentWriting } from '../StudentWriting';

function createExamState(): ExamState {
  const config = createDefaultConfig('Academic', 'Academic');
  config.sections.writing.tasks = [
    {
      id: 'task1',
      label: 'Task 1',
      taskType: 'task1',
      minWords: 150,
      recommendedTime: 20,
    },
  ];

  return {
    title: 'Test Exam',
    type: 'Academic',
    activeModule: 'writing',
    activePassageId: 'p1',
    activeListeningPartId: 'l1',
    config,
    reading: { passages: [] },
    listening: { parts: [] },
    writing: {
      task1Prompt: 'Task 1 prompt',
      task2Prompt: 'Task 2 prompt',
      tasks: [],
      customPromptTemplates: [],
    },
    speaking: {
      part1Topics: [],
      cueCard: '',
      part3Discussion: [],
    },
  };
}

describe('StudentWriting lifecycle durability', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('commits the current editor draft on compositionend', () => {
    const onWritingChange = vi.fn();

    render(
      <StudentWriting
        state={createExamState()}
        writingAnswers={{}}
        onWritingChange={onWritingChange}
        onSubmit={() => undefined}
        currentQuestionId={null}
        onNavigate={() => undefined}
      />,
    );

    const editor = screen.getByRole('textbox', { name: /writing response/i });
    editor.innerHTML = '<p>Composed draft</p>';

    fireEvent.compositionEnd(editor);

    expect(onWritingChange).toHaveBeenCalledWith('task1', '<p>Composed draft</p>');
  });

  it('commits the current editor draft when the page is hidden or unloaded', () => {
    const onWritingChange = vi.fn();

    render(
      <StudentWriting
        state={createExamState()}
        writingAnswers={{}}
        onWritingChange={onWritingChange}
        onSubmit={() => undefined}
        currentQuestionId={null}
        onNavigate={() => undefined}
      />,
    );

    const editor = screen.getByRole('textbox', { name: /writing response/i });

    editor.innerHTML = '<p>Draft before pagehide</p>';
    fireEvent(window, new Event('pagehide'));
    expect(onWritingChange).toHaveBeenCalledWith('task1', '<p>Draft before pagehide</p>');

    onWritingChange.mockClear();
    const originalDescriptor = Object.getOwnPropertyDescriptor(document, 'visibilityState');
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });

    editor.innerHTML = '<p>Draft before hidden</p>';
    fireEvent(document, new Event('visibilitychange'));
    expect(onWritingChange).toHaveBeenCalledWith('task1', '<p>Draft before hidden</p>');

    if (originalDescriptor) {
      Object.defineProperty(document, 'visibilityState', originalDescriptor);
    }
  });
});
