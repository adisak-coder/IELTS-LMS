import React, { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ErrorSurface, LoadingSurface } from '@components/ui';
import { StudentAppWrapper } from '@components/student/StudentAppWrapper';
import { useBuilderRouteController } from '@builder/hooks/useBuilderRouteController';
import { getEnabledModules, getFirstQuestionIdForModule } from '@services/examAdapterService';
import type { StudentAttempt } from '../../../types/studentAttempt';
import type { ExamState, ModuleType } from '../../../types';

const MODULE_KEYS: ModuleType[] = ['listening', 'reading', 'writing', 'speaking'];

export function ExamPreviewRoute() {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [previewRevision, setPreviewRevision] = useState(0);

  const requestedModule = useMemo<ModuleType | null>(() => {
    const raw = searchParams.get('module');
    if (!raw) {
      return null;
    }
    const normalized = raw.trim().toLowerCase();
    return MODULE_KEYS.includes(normalized as ModuleType) ? (normalized as ModuleType) : null;
  }, [searchParams]);

  if (!examId) {
    return (
      <ErrorSurface
        title="Preview unavailable"
        description="Exam ID not found."
      />
    );
  }

  const controller = useBuilderRouteController(examId);

  if (controller.isLoading) {
    return <LoadingSurface label="Loading preview…" />;
  }

  if (controller.error) {
    return (
      <ErrorSurface
        title="Preview load failed"
        description={controller.error}
      />
    );
  }

  if (!controller.state) {
    return (
      <ErrorSurface
        title="Preview unavailable"
        description="The requested exam could not be loaded."
      />
    );
  }

  const enabledModules = getEnabledModules(controller.state.config);
  const previewModule =
    requestedModule && enabledModules.includes(requestedModule)
      ? requestedModule
      : enabledModules[0] ?? 'reading';
  const now = new Date().toISOString();
  const attemptSnapshot: StudentAttempt = {
    id: `preview-attempt:${examId}`,
    scheduleId: `preview-schedule:${examId}`,
    studentKey: `preview-student:${examId}`,
    examId,
    revision: null,
    publishedVersionId: null,
    examTitle: controller.state.title,
    candidateId: '',
    candidateName: 'Preview Candidate',
    candidateEmail: 'preview@example.local',
    phase: 'exam',
    currentModule: previewModule,
    currentQuestionId: getInitialQuestionId(controller.state, previewModule),
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
    submittedAt: null,
    integrity: {
      preCheck: null,
      deviceFingerprintHash: null,
      clientSessionId: null,
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
      clientSessionId: null,
      syncState: 'idle',
    },
    createdAt: now,
    updatedAt: now,
  };

  const handleModuleChange = (nextModule: ModuleType) => {
    if (nextModule === previewModule) {
      return;
    }

    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('module', nextModule);
    setSearchParams(nextParams, { replace: true });
    setPreviewRevision((current) => current + 1);
  };

  return (
    <>
      <div className="fixed top-20 right-3 md:right-4 lg:right-6 z-[120] rounded-md border border-gray-200 bg-white/95 shadow-sm px-3 py-1.5 backdrop-blur">
        <label className="text-xs font-semibold text-gray-700">
          Preview section
          <select
            aria-label="Preview section"
            value={previewModule}
            onChange={(event) => handleModuleChange(event.target.value as ModuleType)}
            className="ml-2 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-semibold text-gray-800"
          >
            {enabledModules.map((module) => (
              <option key={module} value={module}>
                {module.charAt(0).toUpperCase() + module.slice(1)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <StudentAppWrapper
        key={`preview-${examId}-${previewModule}-${previewRevision}`}
        state={controller.state}
        onExit={() => navigate(`/builder/${examId}/builder`, { replace: true })}
        attemptSnapshot={attemptSnapshot}
        showSubmitControls={false}
        persistenceEnabled={false}
        enableMonitoring={false}
      />
    </>
  );
}

function getInitialQuestionId(state: ExamState, module: ModuleType): string | null {
  if (module === 'reading' || module === 'listening') {
    return getFirstQuestionIdForModule(state, module);
  }

  if (module === 'writing') {
    return state.config.sections.writing.tasks[0]?.id ?? 'task1';
  }

  return null;
}
