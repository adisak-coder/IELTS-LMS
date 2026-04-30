import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAsyncPolling } from '@app/hooks/useAsyncPolling';
import { useLiveUpdates, type LiveUpdateEvent } from '@app/hooks/useLiveUpdates';
import { useAuthSession } from '../../auth/authSession';
import { hydrateExamState } from '@services/examAdapterService';
import {
  backendGet,
  mapBackendExamVersion,
  mapBackendRuntime,
  mapBackendSchedule,
} from '@services/backendBridge';
import {
  mapBackendStudentAttempt,
  studentAttemptRepository,
} from '@services/studentAttemptRepository';
import type { ExamState } from '../../../types';
import type { ExamSchedule, ExamSessionRuntime } from '../../../types/domain';
import type { StudentAttempt } from '../../../types/studentAttempt';

const PROFILE_STORAGE_PREFIX = 'ielts-student-profile:';

function normalizeWcodeCandidateId(studentId?: string) {
  if (!studentId) {
    return null;
  }

  const normalized = studentId.trim().toUpperCase();
  return normalized || null;
}

function isWcodeCandidateId(candidateId: string) {
  return /^W[0-9]{6}$/.test(candidateId);
}

function buildStudentKey(scheduleId: string, candidateId: string) {
  return `student-${scheduleId}-${candidateId}`;
}

function buildBackendStaticSessionEndpoint(scheduleId: string, candidateId: string) {
  const query = new URLSearchParams({ candidateId });
  return `/v1/student/sessions/${scheduleId}/static?${query.toString()}`;
}

function buildBackendLiveSessionEndpoint(scheduleId: string, candidateId: string) {
  const query = new URLSearchParams({ candidateId });
  return `/v1/student/sessions/${scheduleId}/live?${query.toString()}`;
}

function loadStoredCandidateProfile(
  scheduleId: string,
  candidateId: string,
): { candidateName?: string; candidateEmail?: string } | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = window.localStorage.getItem(`${PROFILE_STORAGE_PREFIX}${scheduleId}:${candidateId}`);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as { studentName?: unknown; email?: unknown };
    const studentName = typeof parsed.studentName === 'string' ? parsed.studentName.trim() : '';
    const email = typeof parsed.email === 'string' ? parsed.email.trim() : '';

    const profile: { candidateName?: string; candidateEmail?: string } = {};
    if (studentName) {
      profile.candidateName = studentName;
    }
    if (email) {
      profile.candidateEmail = email;
    }
    return profile;
  } catch {
    return null;
  }
}

function createCandidateProfile(
  candidateId: string,
  stored: { candidateName?: string; candidateEmail?: string } | null,
) {
  return {
    candidateId,
    candidateName: stored?.candidateName ?? `Candidate ${candidateId}`,
    candidateEmail: stored?.candidateEmail ?? `${candidateId}@example.com`,
  };
}

interface StudentSessionRouteData {
  attemptSnapshot: StudentAttempt | null;
  error: string | null;
  isLoading: boolean;
  runtimeSnapshot: ExamSessionRuntime | null;
  schedule: ExamSchedule | null;
  state: ExamState | null;
  refreshRuntime: () => Promise<void>;
  retry: () => Promise<void>;
}

type BackendStaticSession = {
  schedule: Parameters<typeof mapBackendSchedule>[0];
  version: Parameters<typeof mapBackendExamVersion>[0];
};

type BackendLiveSession = {
  runtime?: Parameters<typeof mapBackendRuntime>[0] | null | undefined;
  attempt?: Parameters<typeof mapBackendStudentAttempt>[0] | null | undefined;
  publishedVersionId?: string | null | undefined;
};

interface LoadedStaticSnapshot {
  examState: ExamState;
  scheduleEntity: ExamSchedule;
  versionId: string;
}

export function useStudentSessionRouteData(
  scheduleId?: string,
  studentId?: string,
): StudentSessionRouteData {
  const { session, status: authStatus } = useAuthSession();
  const [attemptSnapshot, setAttemptSnapshot] = useState<StudentAttempt | null>(null);
  const [schedule, setSchedule] = useState<ExamSchedule | null>(null);
  const [state, setState] = useState<ExamState | null>(null);
  const [runtimeSnapshot, setRuntimeSnapshot] = useState<ExamSessionRuntime | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const candidateId = useMemo(() => normalizeWcodeCandidateId(studentId), [studentId]);
  const staticVersionIdRef = useRef<string | null>(null);
  const storedCandidateProfile = useMemo(
    () => (scheduleId && candidateId ? loadStoredCandidateProfile(scheduleId, candidateId) : null),
    [candidateId, scheduleId],
  );
  const studentKey = useMemo(
    () => (scheduleId && candidateId ? buildStudentKey(scheduleId, candidateId) : null),
    [candidateId, scheduleId],
  );

  const loadStaticSessionSnapshot = useCallback(async (): Promise<LoadedStaticSnapshot | null> => {
    if (!scheduleId || !candidateId || !isWcodeCandidateId(candidateId)) {
      return null;
    }

    const session = await backendGet<BackendStaticSession>(
      buildBackendStaticSessionEndpoint(scheduleId, candidateId),
    );
    const scheduleEntity = mapBackendSchedule(session.schedule);
    const version = mapBackendExamVersion(session.version);
    const examState = hydrateExamState({
      ...version.contentSnapshot,
      config: version.configSnapshot,
    } satisfies ExamState);

    setSchedule(scheduleEntity);
    setState(examState);
    staticVersionIdRef.current = version.id;

    return {
      examState,
      scheduleEntity,
      versionId: version.id,
    };
  }, [candidateId, scheduleId]);

  const maybeRebootstrapStaticOnVersionMismatch = useCallback(
    async (live: BackendLiveSession): Promise<LoadedStaticSnapshot | null> => {
      const expectedVersionId = staticVersionIdRef.current;
      if (!expectedVersionId || !live.publishedVersionId || live.publishedVersionId === expectedVersionId) {
        return null;
      }

      return loadStaticSessionSnapshot();
    },
    [loadStaticSessionSnapshot],
  );

  const refreshBackendSessionSnapshot = useCallback(async () => {
    if (!scheduleId || !candidateId || !isWcodeCandidateId(candidateId)) {
      return;
    }

    let scheduleEntity = schedule;
    if (!scheduleEntity) {
      const loaded = await loadStaticSessionSnapshot();
      scheduleEntity = loaded?.scheduleEntity ?? null;
    }

    let live = await backendGet<BackendLiveSession>(buildBackendLiveSessionEndpoint(scheduleId, candidateId));
    const reloadedStatic = await maybeRebootstrapStaticOnVersionMismatch(live);
    if (reloadedStatic) {
      scheduleEntity = reloadedStatic.scheduleEntity;
      live = await backendGet<BackendLiveSession>(buildBackendLiveSessionEndpoint(scheduleId, candidateId));
    }

    setRuntimeSnapshot(
      live.runtime && scheduleEntity ? mapBackendRuntime(live.runtime, scheduleEntity) : null,
    );

    if (live.attempt) {
      const nextAttempt = mapBackendStudentAttempt(live.attempt);
      await studentAttemptRepository.saveAttempt(nextAttempt);
      setAttemptSnapshot(nextAttempt);
    }
  }, [
    candidateId,
    loadStaticSessionSnapshot,
    maybeRebootstrapStaticOnVersionMismatch,
    schedule,
    scheduleId,
  ]);

  const handleLiveUpdate = useCallback(
    (event: LiveUpdateEvent) => {
      if (!scheduleId) {
        return;
      }

      if (event.kind === 'schedule_runtime') {
        if (event.id !== scheduleId) {
          return;
        }
      } else if (event.kind === 'attempt') {
        if (!attemptSnapshot?.id || event.id !== attemptSnapshot.id) {
          return;
        }
      } else {
        return;
      }

      void refreshBackendSessionSnapshot();
    },
    [attemptSnapshot?.id, refreshBackendSessionSnapshot, scheduleId],
  );

  useLiveUpdates({
    ...(scheduleId ? { scheduleId } : {}),
    ...(attemptSnapshot?.id ? { attemptId: attemptSnapshot.id } : {}),
    enabled: Boolean(
      scheduleId &&
        candidateId &&
        isWcodeCandidateId(candidateId) &&
        authStatus === 'authenticated' &&
        !error,
    ),
    onEvent: handleLiveUpdate,
  });

  const loadStudentData = useCallback(async () => {
    if (!scheduleId) {
      setError('Schedule ID not found');
      setIsLoading(false);
      return;
    }

    if (authStatus === 'loading') {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      if (!candidateId || !isWcodeCandidateId(candidateId)) {
        throw new Error('Invalid access code. Please check in again.');
      }

      if (!studentKey) {
        throw new Error('Student identity not found');
      }

      let loadedStatic = await loadStaticSessionSnapshot();
      if (!loadedStatic) {
        throw new Error('Unable to load static exam session context');
      }

      let live = await backendGet<BackendLiveSession>(buildBackendLiveSessionEndpoint(scheduleId, candidateId));
      const reloadedStatic = await maybeRebootstrapStaticOnVersionMismatch(live);
      if (reloadedStatic) {
        loadedStatic = reloadedStatic;
        live = await backendGet<BackendLiveSession>(buildBackendLiveSessionEndpoint(scheduleId, candidateId));
      }

      const mappedRuntime = live.runtime
        ? mapBackendRuntime(live.runtime, loadedStatic.scheduleEntity)
        : null;
      setRuntimeSnapshot(mappedRuntime);

      if (live.attempt) {
        const nextAttempt = mapBackendStudentAttempt(live.attempt);
        await studentAttemptRepository.saveAttempt(nextAttempt);
        setAttemptSnapshot(nextAttempt);
      } else {
        const firstEnabledModule =
          (['listening', 'reading', 'writing', 'speaking'] as const).find(
            (module) => loadedStatic.examState.config.sections[module].enabled,
          ) ?? 'listening';

        const createdAttempt = await studentAttemptRepository.createAttempt({
          scheduleId,
          studentKey,
          examId: loadedStatic.scheduleEntity.examId,
          examTitle: loadedStatic.scheduleEntity.examTitle,
          ...createCandidateProfile(candidateId, storedCandidateProfile),
          currentModule: mappedRuntime?.currentSectionKey ?? firstEnabledModule,
        });
        setAttemptSnapshot(createdAttempt);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load exam data');
    } finally {
      setIsLoading(false);
    }
  }, [
    authStatus,
    candidateId,
    loadStaticSessionSnapshot,
    maybeRebootstrapStaticOnVersionMismatch,
    scheduleId,
    storedCandidateProfile,
    studentKey,
  ]);

  useEffect(() => {
    void loadStudentData();
  }, [loadStudentData]);

  const pollIntervalMs = runtimeSnapshot?.status === 'live' ? 10_000 : 20_000;
  const pollMaxIntervalMs = runtimeSnapshot?.status === 'live' ? 15_000 : 30_000;

  useAsyncPolling(
    async () => {
      await refreshBackendSessionSnapshot();
    },
    {
      enabled: Boolean(scheduleId && state && !error),
      intervalMs: pollIntervalMs,
      maxIntervalMs: pollMaxIntervalMs,
    },
  );

  return {
    attemptSnapshot,
    error,
    isLoading,
    runtimeSnapshot,
    schedule,
    state,
    refreshRuntime: refreshBackendSessionSnapshot,
    retry: loadStudentData,
  };
}
