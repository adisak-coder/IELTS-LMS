import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import { useProctorRouteController } from '../useProctorRouteController';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('useProctorRouteController', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('hydrates real roster sessions and targeted alerts from persisted attempts', async () => {
    const originalFetch = global.fetch;
    global.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === '/api/v1/proctor/sessions') {
        return new Response(
          JSON.stringify({
            success: true,
            data: [
              {
                schedule: {
                  id: 'sched-1',
                  examId: 'exam-1',
                  examTitle: 'Mock IELTS Exam',
                  publishedVersionId: 'ver-1',
                  cohortName: 'Cohort A',
                  institution: null,
                  startTime: '2026-01-01T00:00:00.000Z',
                  endTime: '2026-01-01T03:00:00.000Z',
                  plannedDurationMinutes: 180,
                  deliveryMode: 'proctor_start',
                  recurrenceType: 'none',
                  recurrenceInterval: 1,
                  recurrenceEndDate: null,
                  bufferBeforeMinutes: null,
                  bufferAfterMinutes: null,
                  autoStart: false,
                  autoStop: false,
                  status: 'live',
                  createdAt: '2026-01-01T00:00:00.000Z',
                  createdBy: 'Admin',
                  updatedAt: '2026-01-01T00:00:00.000Z',
                  revision: 1,
                },
                runtime: {
                  id: 'runtime-1',
                  scheduleId: 'sched-1',
                  examId: 'exam-1',
                  status: 'live',
                  actualStartAt: '2026-01-01T00:00:00.000Z',
                  actualEndAt: null,
                  activeSectionKey: 'reading',
                  currentSectionKey: 'reading',
                  currentSectionRemainingSeconds: 1800,
                  waitingForNextSection: false,
                  isOverrun: false,
                  totalPausedSeconds: 0,
                  createdAt: '2026-01-01T00:00:00.000Z',
                  updatedAt: '2026-01-01T00:00:00.000Z',
                  sections: [
                    {
                      sectionKey: 'reading',
                      label: 'Reading',
                      sectionOrder: 1,
                      plannedDurationMinutes: 60,
                      gapAfterMinutes: 0,
                      status: 'live',
                      availableAt: '2026-01-01T00:00:00.000Z',
                      actualStartAt: '2026-01-01T00:00:00.000Z',
                      actualEndAt: null,
                      pausedAt: null,
                      accumulatedPausedSeconds: 0,
                      extensionMinutes: 0,
                      completionReason: null,
                      projectedStartAt: '2026-01-01T00:00:00.000Z',
                      projectedEndAt: '2026-01-01T01:00:00.000Z',
                    },
                  ],
                },
                degradedLiveMode: false,
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }

      if (url === '/api/v1/proctor/sessions/sched-1?mode=dashboard&auditLimit=200&alertLimit=100') {
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              schedule: {
                id: 'sched-1',
                examId: 'exam-1',
                examTitle: 'Mock IELTS Exam',
                publishedVersionId: 'ver-1',
                cohortName: 'Cohort A',
                institution: null,
                startTime: '2026-01-01T00:00:00.000Z',
                endTime: '2026-01-01T03:00:00.000Z',
                plannedDurationMinutes: 180,
                deliveryMode: 'proctor_start',
                recurrenceType: 'none',
                recurrenceInterval: 1,
                recurrenceEndDate: null,
                bufferBeforeMinutes: null,
                bufferAfterMinutes: null,
                autoStart: false,
                autoStop: false,
                status: 'live',
                createdAt: '2026-01-01T00:00:00.000Z',
                createdBy: 'Admin',
                updatedAt: '2026-01-01T00:00:00.000Z',
                revision: 1,
              },
              runtime: {
                id: 'runtime-1',
                scheduleId: 'sched-1',
                examId: 'exam-1',
                status: 'live',
                actualStartAt: '2026-01-01T00:00:00.000Z',
                actualEndAt: null,
                activeSectionKey: 'reading',
                currentSectionKey: 'reading',
                currentSectionRemainingSeconds: 1800,
                waitingForNextSection: false,
                isOverrun: false,
                totalPausedSeconds: 0,
                createdAt: '2026-01-01T00:00:00.000Z',
                updatedAt: '2026-01-01T00:00:00.000Z',
                sections: [
                  {
                    sectionKey: 'reading',
                    label: 'Reading',
                    sectionOrder: 1,
                    plannedDurationMinutes: 60,
                    gapAfterMinutes: 0,
                    status: 'live',
                    availableAt: '2026-01-01T00:00:00.000Z',
                    actualStartAt: '2026-01-01T00:00:00.000Z',
                    actualEndAt: null,
                    pausedAt: null,
                    accumulatedPausedSeconds: 0,
                    extensionMinutes: 0,
                    completionReason: null,
                    projectedStartAt: '2026-01-01T00:00:00.000Z',
                    projectedEndAt: '2026-01-01T01:00:00.000Z',
                  },
                ],
              },
              sessions: [
                {
                  attemptId: 'attempt-1',
                  studentId: 'alice',
                  studentName: 'Alice Roe',
                  studentEmail: 'alice@example.com',
                  scheduleId: 'sched-1',
                  status: 'warned',
                  currentSection: 'reading',
                  timeRemaining: 1800,
                  runtimeStatus: 'live',
                  runtimeCurrentSection: 'reading',
                  runtimeTimeRemainingSeconds: 1800,
                  runtimeSectionStatus: 'live',
                  runtimeWaiting: false,
                  violations: [
                    {
                      id: 'warning-1',
                      type: 'PROCTOR_WARNING',
                      severity: 'medium',
                      timestamp: '2026-01-01T00:01:00.000Z',
                      description: 'Please keep your eyes on the screen.',
                    },
                  ],
                  warnings: 1,
                  lastActivity: '2026-01-01T00:03:00.000Z',
                  examId: 'exam-1',
                  examName: 'Mock IELTS Exam',
                },
              ],
              alerts: [
                {
                  id: 'alert-1',
                  severity: 'high',
                  type: 'VIOLATION_DETECTED',
                  studentName: 'Alice Roe',
                  studentId: 'alice',
                  timestamp: '2026-01-01T00:03:00.000Z',
                  message: 'Tab switch detected.',
                  isAcknowledged: false,
                },
              ],
              auditLogs: [
                {
                  id: 'audit-1',
                  scheduleId: 'sched-1',
                  actor: 'student-system',
                  actionType: 'VIOLATION_DETECTED',
                  targetStudentId: 'attempt-1',
                  payload: {
                    message: 'Tab switch detected.',
                    severity: 'high',
                    violationType: 'TAB_SWITCH',
                  },
                  createdAt: '2026-01-01T00:03:00.000Z',
                },
              ],
              notes: [],
              presence: [],
              violationRules: [],
              degradedLiveMode: false,
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }

      return new Response(JSON.stringify({ success: false, error: { message: `Unhandled ${url}` } }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    try {
      const { result } = renderHook(() => useProctorRouteController(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
        expect(result.current.sessions).toHaveLength(1);
      });

      expect(result.current.sessions[0]).toMatchObject({
        id: 'attempt-1',
        studentId: 'alice',
        name: 'Alice Roe',
        email: 'alice@example.com',
        warnings: 1,
        status: 'warned',
      });
      expect(
        new Date(result.current.sessions[0]!.lastActivity).getTime(),
      ).toBeGreaterThanOrEqual(new Date('2026-01-01T00:03:00.000Z').getTime());

      expect(result.current.alerts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            studentId: 'alice',
            studentName: 'Alice Roe',
            severity: 'high',
            message: 'Tab switch detected.',
          }),
        ]),
      );
    } finally {
      global.fetch = originalFetch;
    }
  });
});
