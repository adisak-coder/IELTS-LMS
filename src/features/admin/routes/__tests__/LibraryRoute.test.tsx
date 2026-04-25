import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import type { PassageLibraryItem, QuestionBankItem } from '../../../../types';

const mocks = vi.hoisted(() => ({
  getAllPassages: vi.fn<() => Promise<PassageLibraryItem[]>>(),
  queryPassages: vi.fn<() => Promise<PassageLibraryItem[]>>(),
  getPassageTopics: vi.fn<() => Promise<string[]>>(),
  deletePassage: vi.fn<() => Promise<boolean>>(),
  clearPassages: vi.fn<() => Promise<void>>(),
  getAllQuestions: vi.fn<() => Promise<QuestionBankItem[]>>(),
  queryQuestions: vi.fn<() => Promise<QuestionBankItem[]>>(),
  getQuestionTopics: vi.fn<() => Promise<string[]>>(),
  deleteQuestion: vi.fn<() => Promise<boolean>>(),
  clearQuestions: vi.fn<() => Promise<void>>(),
}));

vi.mock('@services/passageLibraryService', () => ({
  passageLibraryService: {
    getAllPassages: mocks.getAllPassages,
    queryPassages: mocks.queryPassages,
    getTopics: mocks.getPassageTopics,
    deletePassage: mocks.deletePassage,
    clear: mocks.clearPassages,
  },
}));

vi.mock('@services/questionBankService', () => ({
  questionBankService: {
    getAllQuestions: mocks.getAllQuestions,
    queryQuestions: mocks.queryQuestions,
    getTopics: mocks.getQuestionTopics,
    deleteQuestion: mocks.deleteQuestion,
    clear: mocks.clearQuestions,
  },
}));

import { LibraryRoute } from '../LibraryRoute';

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>,
  );
}

describe('LibraryRoute', () => {
  it('renders promise-backed library data without crashing', async () => {
    mocks.getAllPassages.mockResolvedValue([
      {
        id: 'passage-1',
        passage: {
          id: 'passage-1',
          title: 'Urban gardening trends',
          content: 'City residents are converting rooftops into gardens.',
          blocks: [],
          wordCount: 8,
        },
        metadata: {
          id: 'meta-1',
          difficulty: 'easy',
          source: 'editorial',
          topic: 'Environment',
          tags: ['urban'],
          wordCount: 8,
          estimatedTimeMinutes: 1,
          usageCount: 2,
          createdAt: '2026-01-01T00:00:00.000Z',
          author: 'admin',
        },
      },
    ]);
    mocks.queryPassages.mockResolvedValue([
      {
        id: 'passage-1',
        passage: {
          id: 'passage-1',
          title: 'Urban gardening trends',
          content: 'City residents are converting rooftops into gardens.',
          blocks: [],
          wordCount: 8,
        },
        metadata: {
          id: 'meta-1',
          difficulty: 'easy',
          source: 'editorial',
          topic: 'Environment',
          tags: ['urban'],
          wordCount: 8,
          estimatedTimeMinutes: 1,
          usageCount: 2,
          createdAt: '2026-01-01T00:00:00.000Z',
          author: 'admin',
        },
      },
    ]);
    mocks.getPassageTopics.mockResolvedValue(['Environment']);
    mocks.deletePassage.mockResolvedValue(true);
    mocks.clearPassages.mockResolvedValue();

    mocks.getAllQuestions.mockResolvedValue([]);
    mocks.queryQuestions.mockResolvedValue([]);
    mocks.getQuestionTopics.mockResolvedValue([]);
    mocks.deleteQuestion.mockResolvedValue(true);
    mocks.clearQuestions.mockResolvedValue();

    renderWithQueryClient(<LibraryRoute />);

    expect(screen.getByText(/loading library/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/showing 1 of 1 passages/i)).toBeInTheDocument();
    });

    expect(screen.getByText('Urban gardening trends')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Environment' })).toBeInTheDocument();
    expect(mocks.getAllPassages).toHaveBeenCalledTimes(1);
    expect(mocks.getAllQuestions).toHaveBeenCalledTimes(1);
    expect(mocks.queryPassages).not.toHaveBeenCalled();
    expect(mocks.queryQuestions).not.toHaveBeenCalled();
  });
});
