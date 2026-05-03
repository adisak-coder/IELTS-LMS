import React from 'react';
import { useNavigate } from 'react-router-dom';
import { GradingSessionList } from '@components/admin/GradingSessionList';
import { GradingSessionDetail } from '@components/admin/GradingSessionDetail';
import type { StudentReviewWorkspaceProps } from '@components/admin/StudentReviewWorkspace';
import { lazyLoad } from '@app/performance/lazyLoad';
import { AdminShellProvider, useAdminShell } from '@components/admin/providers/AdminShellProvider';

const StudentReviewWorkspace = lazyLoad<StudentReviewWorkspaceProps>(
  () => import('@components/admin/StudentReviewWorkspace').then((module) => ({ default: module.StudentReviewWorkspace })),
  'Loading review workspace...',
  'StudentReviewWorkspace'
);

/**
 * Grading Route
 * 
 * Handles grading workflow including session list, session detail,
 * and student review workspace.
 */
function GradingRouteContent() {
  const navigate = useNavigate();
  const { state: shellState, actions: shellActions } = useAdminShell();

  const handleSessionSelect = (sessionId: string) => {
    shellActions.selectSession(sessionId);
  };

  const handleStudentSelect = (submissionId: string) => {
    shellActions.selectSubmission(submissionId);
  };

  const handleAnswerHistorySelect = (submissionId: string) => {
    navigate(`/admin/answer-history/${submissionId}`);
  };

  return (
    <>
      {shellState.gradingLevel === 'list' && (
        <GradingSessionList onSessionSelect={handleSessionSelect} />
      )}
      {shellState.gradingLevel === 'session' && shellState.selectedSessionId && (
        <GradingSessionDetail 
          sessionId={shellState.selectedSessionId} 
          onBack={shellActions.handleGradingBack}
          onStudentSelect={handleStudentSelect}
          onAnswerHistorySelect={handleAnswerHistorySelect}
        />
      )}
      {shellState.gradingLevel === 'student' && shellState.selectedSubmissionId && (
        <StudentReviewWorkspace 
          submissionId={shellState.selectedSubmissionId}
          onBack={shellActions.handleGradingBack}
          currentTeacherId="TEACHER-001"
          currentTeacherName="Sarah Chen"
        />
      )}
    </>
  );
}

export function GradingRoute() {
  return (
    <AdminShellProvider>
      <GradingRouteContent />
    </AdminShellProvider>
  );
}
