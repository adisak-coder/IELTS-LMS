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
    {
      id: 'task2',
      label: 'Task 2',
      taskType: 'task2',
      minWords: 250,
      recommendedTime: 40,
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
    vi.useRealTimers();
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
    fireEvent.change(editor, { target: { value: 'Composed draft' } });

    fireEvent.compositionEnd(editor);

    expect(onWritingChange).toHaveBeenCalledWith('task1', 'Composed draft');
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

    fireEvent.change(editor, { target: { value: 'Draft before pagehide' } });
    fireEvent(window, new Event('pagehide'));
    expect(onWritingChange).toHaveBeenCalledWith('task1', 'Draft before pagehide');

    onWritingChange.mockClear();
    const originalDescriptor = Object.getOwnPropertyDescriptor(document, 'visibilityState');
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });

    fireEvent.change(editor, { target: { value: 'Draft before hidden' } });
    fireEvent(document, new Event('visibilitychange'));
    expect(onWritingChange).toHaveBeenCalledWith('task1', 'Draft before hidden');

    if (originalDescriptor) {
      Object.defineProperty(document, 'visibilityState', originalDescriptor);
    }
  });

  it('commits the current editor draft on freeze and beforeunload', () => {
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

    fireEvent.change(editor, { target: { value: 'Draft before freeze' } });
    fireEvent(document, new Event('freeze'));
    expect(onWritingChange).toHaveBeenCalledWith('task1', 'Draft before freeze');

    onWritingChange.mockClear();
    fireEvent.change(editor, { target: { value: 'Draft before unload' } });
    fireEvent(window, new Event('beforeunload'));
    expect(onWritingChange).toHaveBeenCalledWith('task1', 'Draft before unload');
  });

  it('commits the current editor draft before switching writing tasks', () => {
    const onWritingChange = vi.fn();
    const onNavigate = vi.fn();

    render(
      <StudentWriting
        state={createExamState()}
        writingAnswers={{}}
        onWritingChange={onWritingChange}
        onSubmit={() => undefined}
        currentQuestionId="task1"
        onNavigate={onNavigate}
      />,
    );

    const editor = screen.getByRole('textbox', { name: /writing response/i });
    fireEvent.change(editor, { target: { value: 'Task 1 visible draft' } });

    fireEvent.click(screen.getByRole('button', { name: 'Task 2' }));

    expect(onWritingChange).toHaveBeenCalledWith('task1', 'Task 1 visible draft');
    expect(onNavigate).toHaveBeenCalledWith('task2');
  });

  it('commits the current editor draft before opening submit review', () => {
    const onWritingChange = vi.fn();

    render(
      <StudentWriting
        state={createExamState()}
        writingAnswers={{}}
        onWritingChange={onWritingChange}
        onSubmit={() => undefined}
        currentQuestionId="task1"
        onNavigate={() => undefined}
      />,
    );

    const editor = screen.getByRole('textbox', { name: /writing response/i });
    fireEvent.change(editor, { target: { value: 'Final visible draft' } });

    fireEvent.click(screen.getByRole('button', { name: /review & submit/i }));

    expect(onWritingChange).toHaveBeenCalledWith('task1', 'Final visible draft');
  });

  it('commits a deferred blur draft when iPad applies a late editor value', () => {
    vi.useFakeTimers();
    const onWritingChange = vi.fn();

    render(
      <StudentWriting
        state={createExamState()}
        writingAnswers={{}}
        onWritingChange={onWritingChange}
        onSubmit={() => undefined}
        currentQuestionId="task1"
        onNavigate={() => undefined}
      />,
    );

    const editor = screen.getByRole('textbox', { name: /writing response/i });
    fireEvent.change(editor, { target: { value: 'blur value' } });
    fireEvent.blur(editor);

    fireEvent.change(editor, { target: { value: 'late iPad value' } });
    vi.runAllTimers();

    expect(onWritingChange).toHaveBeenNthCalledWith(1, 'task1', 'blur value');
    expect(onWritingChange).toHaveBeenNthCalledWith(2, 'task1', 'late iPad value');
  });

  it('dedupes deferred blur commit when editor value does not change', () => {
    vi.useFakeTimers();
    const onWritingChange = vi.fn();

    render(
      <StudentWriting
        state={createExamState()}
        writingAnswers={{}}
        onWritingChange={onWritingChange}
        onSubmit={() => undefined}
        currentQuestionId="task1"
        onNavigate={() => undefined}
      />,
    );

    const editor = screen.getByRole('textbox', { name: /writing response/i });
    fireEvent.change(editor, { target: { value: 'stable value' } });
    fireEvent.blur(editor);

    vi.runAllTimers();

    expect(onWritingChange).toHaveBeenCalledTimes(1);
    expect(onWritingChange).toHaveBeenCalledWith('task1', 'stable value');
  });

  it('preserves exact whitespace and line breaks in writing input commits', () => {
    const onWritingChange = vi.fn();

    render(
      <StudentWriting
        state={createExamState()}
        writingAnswers={{}}
        onWritingChange={onWritingChange}
        onSubmit={() => undefined}
        currentQuestionId="task1"
        onNavigate={() => undefined}
      />,
    );

    const editor = screen.getByRole('textbox', { name: /writing response/i });
    const exact = '  line 1 with  spaces\n\n\tline 3 after blank\n  ';
    fireEvent.change(editor, { target: { value: exact } });
    fireEvent.blur(editor);

    expect(onWritingChange).toHaveBeenLastCalledWith('task1', exact);
  });
});
