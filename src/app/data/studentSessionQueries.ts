import { useQuery } from '@tanstack/react-query';
import {
  backendGet,
  mapBackendExamVersion,
  mapBackendRuntime,
  mapBackendSchedule,
} from '../../services/backendBridge';
import type { StudentAttempt } from '../../types/studentAttempt';
import { liveQueryPolicy, queryKeys, staticQueryPolicy } from './queryClient';

export type BackendStudentSessionContext = {
  schedule: Parameters<typeof mapBackendSchedule>[0];
  version: Parameters<typeof mapBackendExamVersion>[0];
  runtime?: Parameters<typeof mapBackendRuntime>[0] | null | undefined;
  attempt?: unknown | null | undefined;
  degradedLiveMode?: boolean | undefined;
};

export type BackendStudentStaticSessionContext = {
  schedule: Parameters<typeof mapBackendSchedule>[0];
  version: Parameters<typeof mapBackendExamVersion>[0];
  degradedLiveMode: boolean;
};

export type BackendStudentLiveSessionContext = {
  runtime?: Parameters<typeof mapBackendRuntime>[0] | null | undefined;
  attempt?: unknown | null | undefined;
  degradedLiveMode?: boolean | undefined;
};

function appendCandidateId(endpoint: string, candidateId: string) {
  const query = new URLSearchParams({ candidateId });
  return `${endpoint}?${query.toString()}`;
}

export function buildStudentSessionEndpoint(scheduleId: string, candidateId: string) {
  return appendCandidateId(`/v1/student/sessions/${scheduleId}`, candidateId);
}

export function buildStudentStaticSessionEndpoint(scheduleId: string, candidateId: string) {
  return appendCandidateId(`/v1/student/sessions/${scheduleId}/static`, candidateId);
}

export function buildStudentLiveSessionEndpoint(scheduleId: string, candidateId: string) {
  return appendCandidateId(`/v1/student/sessions/${scheduleId}/live`, candidateId);
}

export function fetchStudentStaticSession(scheduleId: string, candidateId: string) {
  return backendGet<BackendStudentStaticSessionContext>(
    buildStudentStaticSessionEndpoint(scheduleId, candidateId),
  );
}

export function fetchStudentLiveSession(scheduleId: string, candidateId: string) {
  return backendGet<BackendStudentLiveSessionContext>(
    buildStudentLiveSessionEndpoint(scheduleId, candidateId),
  );
}

export function useStudentStaticSession(
  scheduleId: string | undefined,
  candidateId: string | null,
  enabled: boolean,
) {
  return useQuery({
    queryKey: queryKeys.students.staticSession(scheduleId ?? '', candidateId ?? ''),
    queryFn: () => fetchStudentStaticSession(scheduleId!, candidateId!),
    enabled: enabled && Boolean(scheduleId && candidateId),
    ...staticQueryPolicy,
  });
}

export function useStudentLiveSession(
  scheduleId: string | undefined,
  candidateId: string | null,
  enabled: boolean,
) {
  return useQuery({
    queryKey: queryKeys.students.liveSession(scheduleId ?? '', candidateId ?? ''),
    queryFn: () => fetchStudentLiveSession(scheduleId!, candidateId!),
    enabled: enabled && Boolean(scheduleId && candidateId),
    ...liveQueryPolicy,
  });
}

export type BackendStudentAttemptPayload = NonNullable<BackendStudentSessionContext['attempt']>;
export type SavedStudentAttempt = StudentAttempt;
