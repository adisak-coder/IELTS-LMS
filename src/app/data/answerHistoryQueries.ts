import { useQuery } from '@tanstack/react-query';
import type { AnswerHistoryTargetType } from '../../features/answer-history/contracts';
import {
  fetchAnswerHistoryOverviewByAttempt,
  fetchAnswerHistoryOverviewBySubmission,
  fetchAnswerHistoryTargetDetail,
} from '@services/answerHistoryService';
import { liveQueryPolicy, queryKeys } from './queryClient';

export function useAnswerHistoryOverviewBySubmission(submissionId: string | null) {
  return useQuery({
    queryKey: submissionId
      ? queryKeys.answerHistory.overviewBySubmission(submissionId)
      : ['answer-history', 'overview', 'submission', 'none'],
    queryFn: () => fetchAnswerHistoryOverviewBySubmission(submissionId as string),
    enabled: Boolean(submissionId),
    ...liveQueryPolicy,
  });
}

export function useAnswerHistoryOverviewByAttempt(attemptId: string | null) {
  return useQuery({
    queryKey: attemptId
      ? queryKeys.answerHistory.overviewByAttempt(attemptId)
      : ['answer-history', 'overview', 'attempt', 'none'],
    queryFn: () => fetchAnswerHistoryOverviewByAttempt(attemptId as string),
    enabled: Boolean(attemptId),
    ...liveQueryPolicy,
  });
}

export function useAnswerHistoryTargetDetail(args: {
  submissionId: string | null;
  targetId: string | null;
  targetType: AnswerHistoryTargetType;
}) {
  const enabled = Boolean(args.submissionId && args.targetId);

  return useQuery({
    queryKey:
      args.submissionId && args.targetId
        ? queryKeys.answerHistory.targetDetail(args.submissionId, args.targetType, args.targetId)
        : ['answer-history', 'detail', 'none'],
    queryFn: () =>
      fetchAnswerHistoryTargetDetail({
        submissionId: args.submissionId as string,
        targetId: args.targetId as string,
        targetType: args.targetType,
      }),
    enabled,
    ...liveQueryPolicy,
  });
}
