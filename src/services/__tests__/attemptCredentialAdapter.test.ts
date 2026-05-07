import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildAttemptAuthorizationHeader,
  clearAttemptCredential,
  hasAttemptCredential,
  refreshAttemptCredentialForAttempt,
  storeAttemptCredential,
  tryBuildAttemptAuthorizationHeader,
} from '../attemptCredentialAdapter';
import type { StudentAttempt } from '../../types/studentAttempt';

function makeAttempt(overrides?: Partial<StudentAttempt>): StudentAttempt {
  const timestamp = new Date('2026-01-01T00:00:00.000Z').toISOString();
  return {
    id: 'attempt-1',
    scheduleId: 'sched-1',
    studentKey: 'student-sched-1-alice',
    examId: 'exam-1',
    revision: 1,
    examTitle: 'Mock Exam',
    candidateId: 'alice',
    candidateName: 'Alice',
    candidateEmail: 'alice@example.com',
    phase: 'exam',
    currentModule: 'reading',
    currentQuestionId: null,
    answers: {},
    writingAnswers: {},
    flags: {},
    violations: [],
    submittedAt: null,
    proctorStatus: 'active',
    proctorNote: null,
    proctorUpdatedAt: null,
    proctorUpdatedBy: null,
    lastWarningId: null,
    lastAcknowledgedWarningId: null,
    integrity: {
      preCheck: null,
      deviceFingerprintHash: null,
      clientSessionId: 'client-1',
      lastDisconnectAt: null,
      lastReconnectAt: null,
      lastHeartbeatAt: null,
      lastHeartbeatStatus: 'idle',
    },
    recovery: {
      lastRecoveredAt: null,
      lastLocalMutationAt: null,
      lastPersistedAt: null,
      lastDroppedMutations: null,
      pendingMutationCount: 0,
      serverAcceptedThroughSeq: 0,
      clientSessionId: 'client-1',
      syncState: 'idle',
    },
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

describe('attemptCredentialAdapter', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    vi.restoreAllMocks();
    global.fetch = originalFetch;
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  it('stores, resolves, and clears attempt credentials by schedule+attempt', () => {
    storeAttemptCredential(
      { id: 'attempt-1', scheduleId: 'sched-1' },
      { attemptToken: 'token-1', expiresAt: '2026-01-01T01:00:00.000Z' },
    );

    expect(hasAttemptCredential('sched-1', 'attempt-1')).toBe(true);
    expect(buildAttemptAuthorizationHeader({ id: 'attempt-1', scheduleId: 'sched-1' })).toEqual({
      Authorization: 'Bearer token-1',
    });
    expect(tryBuildAttemptAuthorizationHeader('sched-1', 'attempt-1')).toEqual({
      Authorization: 'Bearer token-1',
    });

    clearAttemptCredential({ id: 'attempt-1', scheduleId: 'sched-1' });
    expect(hasAttemptCredential('sched-1', 'attempt-1')).toBe(false);
    expect(tryBuildAttemptAuthorizationHeader('sched-1', 'attempt-1')).toBeNull();
  });

  it('refreshes attempt credential from backend and persists latest token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            attemptCredential: {
              attemptToken: 'token-2',
              expiresAt: '2026-01-01T02:00:00.000Z',
            },
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    global.fetch = fetchMock as typeof fetch;

    const refreshed = await refreshAttemptCredentialForAttempt(makeAttempt(), 'client-1');

    expect(refreshed).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/student/sessions/sched-1?candidateId=alice&refreshAttemptCredential=true&clientSessionId=client-1',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(buildAttemptAuthorizationHeader({ id: 'attempt-1', scheduleId: 'sched-1' })).toEqual({
      Authorization: 'Bearer token-2',
    });
  });
});
