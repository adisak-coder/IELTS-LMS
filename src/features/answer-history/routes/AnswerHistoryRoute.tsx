import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AnswerHistoryPage } from '@components/answer-history/AnswerHistoryPage';

export function AdminAnswerHistoryRoute() {
  const navigate = useNavigate();
  const { submissionId } = useParams<{ submissionId: string }>();

  return (
    <AnswerHistoryPage
      submissionId={submissionId ?? null}
      headingPrefix="Grading"
      backLabel="Back to Grading"
      onBack={() => navigate('/admin/grading')}
    />
  );
}

export function ProctorAnswerHistoryRoute() {
  const navigate = useNavigate();
  const { attemptId } = useParams<{ attemptId: string }>();

  return (
    <AnswerHistoryPage
      attemptId={attemptId ?? null}
      headingPrefix="Proctor"
      backLabel="Back to Proctor"
      onBack={() => navigate('/proctor')}
    />
  );
}
