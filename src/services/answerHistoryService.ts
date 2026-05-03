import { backendGet } from './backendBridge';
import type {
  AnswerHistoryExport,
  AnswerHistoryExportFormat,
  AnswerHistoryOverview,
  AnswerHistoryTargetDetail,
  AnswerHistoryTargetType,
} from '../features/answer-history/contracts';

function encode(value: string) {
  return encodeURIComponent(value);
}

export async function fetchAnswerHistoryOverviewBySubmission(submissionId: string) {
  return backendGet<AnswerHistoryOverview>(`/v1/answer-history/submissions/${encode(submissionId)}/overview`);
}

export async function fetchAnswerHistoryOverviewByAttempt(attemptId: string) {
  return backendGet<AnswerHistoryOverview>(`/v1/answer-history/attempts/${encode(attemptId)}/overview`);
}

export async function fetchAnswerHistoryTargetDetail(args: {
  submissionId: string;
  targetId: string;
  targetType: AnswerHistoryTargetType;
  cursor?: number | undefined;
  limit?: number | undefined;
}) {
  const query = new URLSearchParams({
    targetType: args.targetType,
    ...(typeof args.cursor === 'number' ? { cursor: String(args.cursor) } : {}),
    ...(typeof args.limit === 'number' ? { limit: String(args.limit) } : {}),
  });

  return backendGet<AnswerHistoryTargetDetail>(
    `/v1/answer-history/submissions/${encode(args.submissionId)}/targets/${encode(args.targetId)}?${query.toString()}`,
  );
}

export async function fetchAnswerHistoryExport(args: {
  submissionId: string;
  targetId: string;
  targetType: AnswerHistoryTargetType;
  format: AnswerHistoryExportFormat;
}) {
  const query = new URLSearchParams({
    targetType: args.targetType,
    targetId: args.targetId,
    format: args.format,
  });

  return backendGet<AnswerHistoryExport>(
    `/v1/answer-history/submissions/${encode(args.submissionId)}/export?${query.toString()}`,
  );
}
