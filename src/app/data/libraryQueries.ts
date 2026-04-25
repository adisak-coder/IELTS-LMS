import { useMutation, useQuery, useQueryClient, type UseMutationOptions } from '@tanstack/react-query';
import { passageLibraryService } from '../../services/passageLibraryService';
import { questionBankService } from '../../services/questionBankService';
import type {
  Passage,
  PassageLibraryItem,
  PassageMetadata,
  QuestionBankItem,
  QuestionBlock,
  QuestionMetadata,
} from '../../types';
import { queryClient, queryKeys, staticQueryPolicy } from './queryClient';

export function invalidateLibraryQueries(): void {
  queryClient.invalidateQueries({ queryKey: queryKeys.library.all });
}

export function useLibraryPassages() {
  return useQuery({
    queryKey: queryKeys.library.passages(),
    queryFn: () => passageLibraryService.getAllPassages(),
    ...staticQueryPolicy,
  });
}

export function useLibraryQuestions() {
  return useQuery({
    queryKey: queryKeys.library.questions(),
    queryFn: () => questionBankService.getAllQuestions(),
    ...staticQueryPolicy,
  });
}

export function useDeleteLibraryPassage(
  options?: UseMutationOptions<boolean, Error, string>,
) {
  const client = useQueryClient();

  return useMutation({
    ...options,
    mutationFn: (id) => passageLibraryService.deletePassage(id),
    onSuccess: (...args) => {
      client.invalidateQueries({ queryKey: queryKeys.library.passages() });
      options?.onSuccess?.(...args);
    },
  });
}

export function useDeleteLibraryQuestion(
  options?: UseMutationOptions<boolean, Error, string>,
) {
  const client = useQueryClient();

  return useMutation({
    ...options,
    mutationFn: (id) => questionBankService.deleteQuestion(id),
    onSuccess: (...args) => {
      client.invalidateQueries({ queryKey: queryKeys.library.questions() });
      options?.onSuccess?.(...args);
    },
  });
}

export function useAddLibraryPassage(
  options?: UseMutationOptions<
    PassageLibraryItem,
    Error,
    {
      passage: Passage;
      metadata: Omit<PassageMetadata, 'id' | 'createdAt' | 'usageCount'>;
    }
  >,
) {
  const client = useQueryClient();

  return useMutation({
    ...options,
    mutationFn: ({ passage, metadata }) => passageLibraryService.addPassage(passage, metadata),
    onSuccess: (...args) => {
      client.invalidateQueries({ queryKey: queryKeys.library.passages() });
      options?.onSuccess?.(...args);
    },
  });
}

export function useAddLibraryQuestion(
  options?: UseMutationOptions<
    QuestionBankItem,
    Error,
    {
      block: QuestionBlock;
      metadata: Omit<QuestionMetadata, 'id' | 'createdAt' | 'usageCount'>;
    }
  >,
) {
  const client = useQueryClient();

  return useMutation({
    ...options,
    mutationFn: ({ block, metadata }) => questionBankService.addQuestion(block, metadata),
    onSuccess: (...args) => {
      client.invalidateQueries({ queryKey: queryKeys.library.questions() });
      options?.onSuccess?.(...args);
    },
  });
}
