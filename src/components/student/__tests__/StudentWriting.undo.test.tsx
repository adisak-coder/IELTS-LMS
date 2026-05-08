import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDefaultConfig } from '../../../constants/examDefaults';
import type { ExamState } from '../../../types';
import { StudentWriting } from '../StudentWriting';

const saveStudentAuditEventMock = vi.fn();

vi.mock('../../../services/studentAuditService', () => ({
  saveStudentAuditEvent: (...args: unknown[]) => saveStudentAuditEventMock(...args),
}));

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

describe('StudentWriting undo guard', () => {
  afterEach(() => {
    saveStudentAuditEventMock.mockReset();
    vi.restoreAllMocks();
  });

  it('blocks keyboard undo shortcuts in the writing editor', () => {
    render(
      <StudentWriting
        state={createExamState()}
        writingAnswers={{ task1: 'Current answer' }}
        onWritingChange={vi.fn()}
        onSubmit={vi.fn()}
        currentQuestionId="task1"
        onNavigate={vi.fn()}
        sessionId="sched-1"
        studentId="attempt-1"
      />,
    );

    const editor = screen.getByRole('textbox', { name: /writing response/i });
    const undoShortcut = new KeyboardEvent('keydown', {
      key: 'z',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });

    fireEvent(editor, undoShortcut);

    expect(undoShortcut.defaultPrevented).toBe(true);
    expect(saveStudentAuditEventMock).toHaveBeenCalledWith(
      'sched-1',
      'UNDO_BLOCKED',
      expect.objectContaining({
        surface: 'writing',
        targetName: 'writing-editor',
        via: 'keydown',
      }),
      'attempt-1',
    );
  });

  it('blocks historyUndo beforeinput in the writing editor', () => {
    render(
      <StudentWriting
        state={createExamState()}
        writingAnswers={{ task1: 'Current answer' }}
        onWritingChange={vi.fn()}
        onSubmit={vi.fn()}
        currentQuestionId="task1"
        onNavigate={vi.fn()}
        sessionId="sched-1"
        studentId="attempt-1"
      />,
    );

    const editor = screen.getByRole('textbox', { name: /writing response/i });
    const undoBeforeInput = new Event('beforeinput', { bubbles: true, cancelable: true });
    Object.assign(undoBeforeInput, { inputType: 'historyUndo' });

    fireEvent(editor, undoBeforeInput);

    expect(undoBeforeInput.defaultPrevented).toBe(true);
    expect(saveStudentAuditEventMock).toHaveBeenCalledWith(
      'sched-1',
      'UNDO_BLOCKED',
      expect.objectContaining({
        surface: 'writing',
        targetName: 'writing-editor',
        via: 'beforeinput',
      }),
      'attempt-1',
    );
  });
});
