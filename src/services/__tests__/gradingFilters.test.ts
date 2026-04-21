import { describe, expect, it } from 'vitest';
import type { GradingSession, StudentSubmission } from '../../types/grading';
import {
  filterGradingSessions,
  filterStudentSubmissions,
  mapScheduleStatusToGradingStatus,
} from '../gradingFilters';

describe('grading filters', () => {
  it('maps schedule status with a safe fallback', () => {
    expect(mapScheduleStatusToGradingStatus('scheduled')).toBe('scheduled');
    expect(mapScheduleStatusToGradingStatus('unknown-status')).toBe('scheduled');
  });

  it('filters grading sessions by cohort/exam/searchQuery', () => {
    const sessions: GradingSession[] = [
      {
        id: 's1',
        scheduleId: 'sched-1',
        examId: 'exam-1',
        examTitle: 'IELTS A',
        publishedVersionId: 'ver-1',
        cohortName: 'Cohort A',
        institution: 'X',
        startTime: '2026-01-01T00:00:00.000Z',
        endTime: '2026-01-01T01:00:00.000Z',
        status: 'scheduled',
        totalStudents: 0,
        submittedCount: 0,
        pendingManualReviews: 0,
        inProgressReviews: 0,
        finalizedReviews: 0,
        overdueReviews: 0,
        assignedTeachers: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        createdBy: 'admin',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 's2',
        scheduleId: 'sched-2',
        examId: 'exam-2',
        examTitle: 'IELTS B',
        publishedVersionId: 'ver-2',
        cohortName: 'Cohort B',
        institution: 'Y',
        startTime: '2026-01-01T00:00:00.000Z',
        endTime: '2026-01-01T01:00:00.000Z',
        status: 'scheduled',
        totalStudents: 0,
        submittedCount: 0,
        pendingManualReviews: 0,
        inProgressReviews: 0,
        finalizedReviews: 0,
        overdueReviews: 0,
        assignedTeachers: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        createdBy: 'admin',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];

    expect(
      filterGradingSessions(sessions, { cohort: ['Cohort A'] }),
    ).toHaveLength(1);
    expect(
      filterGradingSessions(sessions, { exam: ['IELTS B'] })[0]?.id,
    ).toBe('s2');
    expect(
      filterGradingSessions(sessions, { searchQuery: 'cohort b' })[0]?.id,
    ).toBe('s2');
  });

  it('filters student submissions by status/assignedTeacher/flags/searchQuery', () => {
    const submissions: StudentSubmission[] = [
      {
        id: 'sub-1',
        submissionId: 'sub-1',
        scheduleId: 'sched-1',
        examId: 'exam-1',
        publishedVersionId: 'ver-1',
        studentId: 'stu-1',
        studentName: 'Alice',
        studentEmail: 'alice@example.com',
        cohortName: 'Cohort A',
        submittedAt: '2026-01-01T00:00:00.000Z',
        timeSpentSeconds: 0,
        gradingStatus: 'submitted',
        assignedTeacherId: 't1',
        assignedTeacherName: 'Teacher 1',
        isFlagged: true,
        isOverdue: false,
        sectionStatuses: {
          listening: 'pending',
          reading: 'pending',
          writing: 'pending',
          speaking: 'pending',
        },
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'sub-2',
        submissionId: 'sub-2',
        scheduleId: 'sched-1',
        examId: 'exam-1',
        publishedVersionId: 'ver-1',
        studentId: 'stu-2',
        studentName: 'Bob',
        studentEmail: 'bob@example.com',
        cohortName: 'Cohort A',
        submittedAt: '2026-01-01T00:00:00.000Z',
        timeSpentSeconds: 0,
        gradingStatus: 'released',
        assignedTeacherId: 't2',
        assignedTeacherName: 'Teacher 2',
        isFlagged: false,
        isOverdue: true,
        sectionStatuses: {
          listening: 'pending',
          reading: 'pending',
          writing: 'pending',
          speaking: 'pending',
        },
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];

    expect(filterStudentSubmissions(submissions, { status: ['released'] })).toEqual([submissions[1]]);
    expect(filterStudentSubmissions(submissions, { assignedTeacher: 't1' })).toEqual([submissions[0]]);
    expect(filterStudentSubmissions(submissions, { isFlagged: true })).toEqual([submissions[0]]);
    expect(filterStudentSubmissions(submissions, { isOverdue: true })).toEqual([submissions[1]]);
    expect(filterStudentSubmissions(submissions, { searchQuery: 'alice' })).toEqual([submissions[0]]);
  });
});

