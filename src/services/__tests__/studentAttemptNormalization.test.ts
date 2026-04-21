import { describe, expect, it } from 'vitest';
import type { StudentAttempt } from '../../types/studentAttempt';
import {
  deriveCandidateId,
  deriveProctorStatus,
  normalizeStudentAttempt,
} from '../studentAttemptNormalization';

function baseAttempt(overrides: Partial<StudentAttempt> = {}): StudentAttempt {
  return {
    id: 'attempt-1',
    scheduleId: 'schedule-1',
    studentKey: 'student-schedule-1-W250334',
    examId: 'exam-1',
    examTitle: 'Exam',
    candidateId: 'W250334',
    candidateName: 'Candidate W250334',
    candidateEmail: 'W250334@example.com',
    phase: 'exam',
    currentModule: 'reading',
    currentQuestionId: null,
    answers: {},
    writingAnswers: {},
    flags: {},
    violations: [],
    proctorStatus: 'active',
    proctorNote: null,
    proctorUpdatedAt: null,
    proctorUpdatedBy: null,
    lastWarningId: null,
    lastAcknowledgedWarningId: null,
    integrity: {
      preCheck: null,
      deviceFingerprintHash: null,
      lastDisconnectAt: null,
      lastReconnectAt: null,
      lastHeartbeatAt: null,
      lastHeartbeatStatus: 'idle',
    },
    recovery: {
      lastRecoveredAt: null,
      lastLocalMutationAt: null,
      lastPersistedAt: null,
      pendingMutationCount: 0,
      serverAcceptedThroughSeq: 0,
      syncState: 'idle',
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('student attempt normalization', () => {
  it('derives candidateId from studentKey when missing', () => {
    const attempt = baseAttempt({
      candidateId: '' as unknown as string,
      studentKey: 'student-schedule-1-W250334',
    });
    const derived = deriveCandidateId({
      id: attempt.id,
      scheduleId: attempt.scheduleId,
      studentKey: attempt.studentKey,
      candidateId: (undefined as unknown) as string,
    });
    expect(derived).toBe('W250334');
  });

  it('marks post-exam attempts as terminated when proctorStatus is missing', () => {
    const attempt = baseAttempt({
      phase: 'post-exam',
      proctorStatus: (undefined as unknown) as StudentAttempt['proctorStatus'],
    });
    expect(deriveProctorStatus(attempt)).toBe('terminated');
  });

  it('marks attempts as warned when a warning exists and is not acknowledged', () => {
    const attempt = baseAttempt({
      proctorStatus: (undefined as unknown) as StudentAttempt['proctorStatus'],
      violations: [
        {
          id: 'v1',
          type: 'PROCTOR_WARNING',
          severity: 'low' as any,
          timestamp: '2026-01-01T00:00:00.000Z',
          description: 'warn',
        },
      ],
      lastWarningId: null,
      lastAcknowledgedWarningId: null,
    });
    expect(deriveProctorStatus(attempt)).toBe('warned');
  });

  it('fills nullish fields while preserving provided values', () => {
    const attempt = baseAttempt({
      candidateName: (undefined as unknown) as string,
      candidateEmail: (undefined as unknown) as string,
      proctorNote: (undefined as unknown) as string | null,
      integrity: (undefined as unknown) as StudentAttempt['integrity'],
      recovery: (undefined as unknown) as StudentAttempt['recovery'],
    });

    const normalized = normalizeStudentAttempt(attempt);

    expect(normalized.candidateName).toBe('Candidate W250334');
    expect(normalized.candidateEmail).toBe('W250334@example.com');
    expect(normalized.proctorNote).toBe(null);
    expect(normalized.integrity).toEqual(
      expect.objectContaining({
        preCheck: null,
        deviceFingerprintHash: null,
        lastHeartbeatStatus: 'idle',
      }),
    );
    expect(normalized.recovery).toEqual(
      expect.objectContaining({
        pendingMutationCount: 0,
        serverAcceptedThroughSeq: 0,
        syncState: 'idle',
      }),
    );
  });
});

