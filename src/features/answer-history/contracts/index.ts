export type AnswerHistoryTargetType = 'objective' | 'writing';

export type AnswerHistoryExportFormat = 'json' | 'csv';

export interface AnswerHistorySignal {
  signalType: string;
  severity: 'low' | 'medium' | 'high' | 'critical' | string;
  message: string;
  evidence: Record<string, unknown>;
}

export interface AnswerHistoryQuestionSummary {
  targetId: string;
  label: string;
  module: string;
  targetType: AnswerHistoryTargetType;
  revisionCount: number;
  finalValue: unknown;
}

export interface AnswerHistorySectionStat {
  module: string;
  totalRevisions: number;
  editedTargets: number;
}

export interface AnswerHistoryOverview {
  submissionId: string;
  attemptId: string;
  scheduleId: string;
  examId: string;
  examTitle: string;
  candidateId: string;
  candidateName: string;
  candidateEmail: string;
  startedAt?: string | null | undefined;
  submittedAt?: string | null | undefined;
  totalRevisions: number;
  totalTargetsEdited: number;
  questionSummaries: AnswerHistoryQuestionSummary[];
  sectionStats: AnswerHistorySectionStat[];
  signals: AnswerHistorySignal[];
}

export interface AnswerHistoryCheckpoint {
  id: string;
  index: number;
  mutationId: string;
  mutationType: string;
  timestamp: string;
  clientTimestamp: string;
  serverReceivedAt: string;
  mutationSeq: number;
  appliedRevision?: number | null | undefined;
  summary: string;
  deltaChars: number;
  stateSnapshot: unknown;
}

export interface AnswerHistoryTechnicalLogRow {
  mutationId: string;
  mutationType: string;
  mutationSeq: number;
  payload: Record<string, unknown>;
  clientTimestamp: string;
  serverReceivedAt: string;
  appliedRevision?: number | null | undefined;
}

export interface AnswerHistoryTargetDetail {
  submissionId: string;
  attemptId: string;
  scheduleId: string;
  targetId: string;
  targetLabel: string;
  module: string;
  targetType: AnswerHistoryTargetType;
  finalState: unknown;
  checkpoints: AnswerHistoryCheckpoint[];
  replaySteps: AnswerHistoryCheckpoint[];
  technicalLogs: AnswerHistoryTechnicalLogRow[];
  signals: AnswerHistorySignal[];
}

export interface AnswerHistoryExport {
  format: AnswerHistoryExportFormat;
  filename: string;
  contentType: string;
  content: string;
}
