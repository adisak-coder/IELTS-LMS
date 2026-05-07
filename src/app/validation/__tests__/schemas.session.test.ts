import { describe, expect, it } from 'vitest';
import { sessionSchemas } from '../schemas';

describe('sessionSchemas.studentSession', () => {
  it('requires a valid email address', () => {
    const session = {
      id: 'attempt-1',
      studentId: 'W250334',
      name: 'Student One',
      email: 'student@example.com',
      scheduleId: 'sched-1',
      status: 'active',
      currentSection: 'reading',
      timeRemaining: 1200,
      violations: [],
      warnings: 0,
      lastActivity: '2026-01-01T09:00:00.000Z',
      examId: 'exam-1',
      examName: 'Mock Exam',
    } as const;

    expect(() => sessionSchemas.studentSession.parse(session)).not.toThrow();
    expect(() =>
      sessionSchemas.studentSession.parse({
        ...session,
        email: undefined,
      }),
    ).toThrow();
  });
});
