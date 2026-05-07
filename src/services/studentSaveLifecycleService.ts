import { backendGet } from './backendBridge';

export interface StudentSaveLifecycleEvent {
  id: string;
  scheduleId: string;
  attemptId: string;
  stage: string;
  status: string;
  cycleId: string | null;
  requestedMutationCount: number | null;
  appliedMutationCount: number | null;
  serverAcceptedThroughSeq: number | null;
  durationMs: number | null;
  errorMessage: string | null;
  createdAt: string;
}

export interface StudentSaveLifecycleQuery {
  scheduleId?: string;
  attemptId?: string;
  stage?: string;
  status?: string;
  from?: string;
  to?: string;
  limit?: number;
}

function buildQuery(args: StudentSaveLifecycleQuery): string {
  const params = new URLSearchParams();
  if (args.scheduleId) params.set('scheduleId', args.scheduleId);
  if (args.attemptId) params.set('attemptId', args.attemptId);
  if (args.stage) params.set('stage', args.stage);
  if (args.status) params.set('status', args.status);
  if (args.from) params.set('from', args.from);
  if (args.to) params.set('to', args.to);
  if (typeof args.limit === 'number' && Number.isFinite(args.limit)) {
    params.set('limit', String(Math.max(1, Math.min(1000, Math.floor(args.limit)))));
  }
  const serialized = params.toString();
  return serialized ? `?${serialized}` : '';
}

export async function listStudentSaveLifecycleEvents(
  query: StudentSaveLifecycleQuery = {},
): Promise<StudentSaveLifecycleEvent[]> {
  return backendGet<StudentSaveLifecycleEvent[]>(
    `/v1/proctor/save-lifecycle${buildQuery(query)}`,
  );
}

