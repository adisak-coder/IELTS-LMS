import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useAsyncPolling } from '@app/hooks/useAsyncPolling';
import {
  backendGet,
  mapBackendRuntime,
  mapBackendSchedule,
  rememberAttemptSchedule,
} from '@services/backendBridge';
import { examDeliveryService } from '@services/examDeliveryService';
import type {
  ProctorAlert,
  SessionAuditLog,
  SessionNote,
  StudentSession,
  ViolationRule,
  ViolationSeverity,
} from '../../../types';
import type { ExamSchedule, ExamSessionRuntime } from '../../../types/domain';
import type { ProctorPresence } from '../../../types/domain';

function mapBackendSessionSummary(payload: {
  attemptId: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  scheduleId: string;
  status: StudentSession['status'];
  currentSection: StudentSession['currentSection'];
  timeRemaining: number;
  runtimeStatus: StudentSession['runtimeStatus'];
  runtimeCurrentSection?: StudentSession['runtimeCurrentSection'] | null | undefined;
  runtimeTimeRemainingSeconds: number;
  runtimeSectionStatus?: StudentSession['runtimeSectionStatus'] | null | undefined;
  runtimeWaiting: boolean;
  violations: StudentSession['violations'];
  warnings: number;
  lastActivity: string;
  examId: string;
  examName: string;
}): StudentSession {
  rememberAttemptSchedule(payload.attemptId, payload.scheduleId);

  return {
    id: payload.attemptId,
    studentId: payload.studentId,
    name: payload.studentName,
    email: payload.studentEmail,
    scheduleId: payload.scheduleId,
    status: payload.status,
    currentSection: payload.currentSection,
    timeRemaining: payload.timeRemaining,
    runtimeStatus: payload.runtimeStatus ?? 'not_started',
    runtimeCurrentSection: payload.runtimeCurrentSection ?? null,
    runtimeTimeRemainingSeconds: payload.runtimeTimeRemainingSeconds,
    runtimeSectionStatus: payload.runtimeSectionStatus ?? undefined,
    runtimeWaiting: payload.runtimeWaiting,
    violations: payload.violations ?? [],
    warnings: payload.warnings,
    lastActivity: payload.lastActivity,
    examId: payload.examId,
    examName: payload.examName,
  };
}

function mapBackendAlert(payload: {
  id: string;
  severity: ProctorAlert['severity'];
  type: string;
  studentName: string;
  studentId: string;
  timestamp: string;
  message: string;
  isAcknowledged: boolean;
}): ProctorAlert {
  return {
    id: payload.id,
    severity: payload.severity,
    type: payload.type,
    studentName: payload.studentName,
    studentId: payload.studentId,
    timestamp: payload.timestamp,
    message: payload.message,
    isAcknowledged: payload.isAcknowledged,
  };
}

function mapBackendAuditLog(payload: {
  id: string;
  scheduleId: string;
  actor: string;
  actionType: SessionAuditLog['actionType'];
  targetStudentId?: string | null | undefined;
  payload?: Record<string, unknown> | null | undefined;
  createdAt: string;
}): SessionAuditLog {
  return {
    id: payload.id,
    timestamp: payload.createdAt,
    actor: payload.actor,
    actionType: payload.actionType,
    targetStudentId: payload.targetStudentId ?? undefined,
    sessionId: payload.scheduleId,
    payload: payload.payload ?? undefined,
  };
}

function mapBackendNote(payload: {
  id: string;
  scheduleId: string;
  author: string;
  category: SessionNote['category'] | string;
  content: string;
  isResolved?: boolean | undefined;
  createdAt: string;
}): SessionNote {
  return {
    id: payload.id,
    scheduleId: payload.scheduleId,
    author: payload.author,
    timestamp: payload.createdAt,
    content: payload.content,
    category:
      payload.category === 'incident' || payload.category === 'handover'
        ? payload.category
        : 'general',
    isResolved: payload.isResolved ?? false,
  };
}

function mapBackendViolationRule(payload: {
  id: string;
  scheduleId: string;
  triggerType: ViolationRule['triggerType'];
  threshold: number;
  specificViolationType?: string | null | undefined;
  specificSeverity?: ViolationRule['specificSeverity'] | null | undefined;
  action: ViolationRule['action'];
  isEnabled: boolean;
  createdAt: string;
  createdBy: string;
}): ViolationRule {
  return {
    id: payload.id,
    scheduleId: payload.scheduleId,
    triggerType: payload.triggerType,
    threshold: payload.threshold,
    specificViolationType: payload.specificViolationType ?? undefined,
    specificSeverity: payload.specificSeverity ?? undefined,
    action: payload.action,
    isEnabled: payload.isEnabled,
    createdAt: payload.createdAt,
    createdBy: payload.createdBy,
  };
}

function mapBackendProctorPresence(payload: {
  proctorId: string;
  proctorName: string;
  joinedAt: string;
  lastHeartbeatAt: string;
}): ProctorPresence {
  return {
    proctorId: payload.proctorId,
    proctorName: payload.proctorName,
    joinedAt: payload.joinedAt,
    lastHeartbeat: payload.lastHeartbeatAt,
  };
}

export interface ProctorRouteController {
  alerts: ProctorAlert[];
  auditLogs: SessionAuditLog[];
  error: string | null;
  isLoading: boolean;
  notes: SessionNote[];
  runtimeSnapshots: ExamSessionRuntime[];
  schedules: ExamSchedule[];
  sessions: StudentSession[];
  violationRules: ViolationRule[];
  handleCompleteExam: (scheduleId: string) => Promise<void>;
  handleEndSectionNow: (scheduleId: string) => Promise<void>;
  handleExtendCurrentSection: (scheduleId: string, minutes: number) => Promise<void>;
  handlePauseCohort: (scheduleId: string) => Promise<void>;
  handleResumeCohort: (scheduleId: string) => Promise<void>;
  handleStartScheduledSession: (scheduleId: string) => Promise<void>;
  reload: () => Promise<void>;
  setAlerts: Dispatch<SetStateAction<ProctorAlert[]>>;
  setNotes: Dispatch<SetStateAction<SessionNote[]>>;
  setSessions: Dispatch<SetStateAction<StudentSession[]>>;
  setViolationRules: Dispatch<SetStateAction<ViolationRule[]>>;
  evaluateViolationRules: (scheduleId: string, studentSessions: StudentSession[]) => Promise<void>;
}

export function useProctorRouteController(): ProctorRouteController {
  const [schedules, setSchedules] = useState<ExamSchedule[]>([]);
  const [runtimeSnapshots, setRuntimeSnapshots] = useState<ExamSessionRuntime[]>([]);
  const [sessions, setSessions] = useState<StudentSession[]>([]);
  const [alerts, setAlerts] = useState<ProctorAlert[]>([]);
  const [auditLogs, setAuditLogs] = useState<SessionAuditLog[]>([]);
  const [notes, setNotes] = useState<SessionNote[]>([]);
  const [violationRules, setViolationRules] = useState<ViolationRule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pollIntervalMs, setPollIntervalMs] = useState(4_000);

  const loadMonitoringState = useCallback(async () => {
    const summaries = await backendGet<Array<{
      schedule: Parameters<typeof mapBackendSchedule>[0];
      runtime: Parameters<typeof mapBackendRuntime>[0];
      degradedLiveMode: boolean;
    }>>('/v1/proctor/sessions');

    if (summaries.length === 0) {
      setSchedules([]);
      setRuntimeSnapshots([]);
      setSessions([]);
      setAlerts([]);
      setAuditLogs([]);
      setNotes([]);
      setViolationRules([]);
      setPollIntervalMs(4_000);
      return;
    }

    const details = await Promise.all(
      summaries.map((summary) =>
        backendGet<{
          schedule: Parameters<typeof mapBackendSchedule>[0];
          runtime: Parameters<typeof mapBackendRuntime>[0];
          sessions: Array<Parameters<typeof mapBackendSessionSummary>[0]>;
          alerts: Array<Parameters<typeof mapBackendAlert>[0]>;
          auditLogs: Array<Parameters<typeof mapBackendAuditLog>[0]>;
          notes: Array<Parameters<typeof mapBackendNote>[0]>;
          presence: Array<Parameters<typeof mapBackendProctorPresence>[0]>;
          violationRules: Array<Parameters<typeof mapBackendViolationRule>[0]>;
          degradedLiveMode: boolean;
        }>(`/v1/proctor/sessions/${summary.schedule.id}`),
      ),
    );

    setPollIntervalMs(details.some((detail) => detail.degradedLiveMode) ? 1_000 : 4_000);
    setSchedules(details.map((detail) => mapBackendSchedule(detail.schedule)));
    setRuntimeSnapshots(
      details.map((detail) => ({
        ...mapBackendRuntime(detail.runtime, mapBackendSchedule(detail.schedule)),
        proctorPresence: (detail.presence ?? []).map(mapBackendProctorPresence),
      })),
    );
    setSessions(
      details
        .flatMap((detail) => detail.sessions)
        .map(mapBackendSessionSummary)
        .sort(
          (left, right) =>
            new Date(right.lastActivity).getTime() - new Date(left.lastActivity).getTime(),
        ),
    );
    setAlerts(
      details
        .flatMap((detail) => detail.alerts)
        .map(mapBackendAlert)
        .sort(
          (left, right) =>
            new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime(),
        ),
    );
    setAuditLogs(details.flatMap((detail) => detail.auditLogs).map(mapBackendAuditLog));
    setNotes(details.flatMap((detail) => detail.notes).map(mapBackendNote));
    setViolationRules(
      details.flatMap((detail) => detail.violationRules).map(mapBackendViolationRule),
    );
  }, []);

  const loadSchedules = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      await loadMonitoringState();
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load proctor data');
    } finally {
      setIsLoading(false);
    }
  }, [loadMonitoringState]);

  useEffect(() => {
    void loadSchedules();
  }, [loadSchedules]);

  useAsyncPolling(loadMonitoringState, {
    enabled: !isLoading && !error,
    intervalMs: pollIntervalMs,
    maxIntervalMs: 4_000,
  });

  const handleStartScheduledSession = useCallback(
    async (scheduleId: string) => {
      await examDeliveryService.startRuntime(scheduleId, 'Proctor');
      await loadMonitoringState();
    },
    [loadMonitoringState],
  );

  const handlePauseCohort = useCallback(
    async (scheduleId: string) => {
      await examDeliveryService.pauseRuntime(scheduleId, 'Proctor');
      await loadMonitoringState();
    },
    [loadMonitoringState],
  );

  const handleResumeCohort = useCallback(
    async (scheduleId: string) => {
      await examDeliveryService.resumeRuntime(scheduleId, 'Proctor');
      await loadMonitoringState();
    },
    [loadMonitoringState],
  );

  const handleEndSectionNow = useCallback(
    async (scheduleId: string) => {
      await examDeliveryService.endCurrentSectionNow(scheduleId, 'Proctor');
      await loadMonitoringState();
    },
    [loadMonitoringState],
  );

  const handleExtendCurrentSection = useCallback(
    async (scheduleId: string, minutes: number) => {
      await examDeliveryService.extendCurrentSection(scheduleId, 'Proctor', minutes);
      await loadMonitoringState();
    },
    [loadMonitoringState],
  );

  const handleCompleteExam = useCallback(
    async (scheduleId: string) => {
      await examDeliveryService.completeRuntime(scheduleId, 'Proctor');
      await loadMonitoringState();
    },
    [loadMonitoringState],
  );

  const evaluateViolationRules = useCallback(
    async (scheduleId: string, studentSessions: StudentSession[]) => {
      const rules = violationRules.filter((rule) => rule.scheduleId === scheduleId);
      const activeRules = rules.filter((rule) => rule.isEnabled);

      if (activeRules.length === 0) {
        return;
      }

      for (const session of studentSessions) {
        if (session.scheduleId !== scheduleId) {
          continue;
        }

        for (const rule of activeRules) {
          let shouldTrigger = false;

          switch (rule.triggerType) {
            case 'violation_count':
              shouldTrigger = session.violations.length >= rule.threshold;
              break;
            case 'specific_violation_type':
              shouldTrigger =
                session.violations.filter(
                  (violation) => violation.type === rule.specificViolationType,
                ).length >= rule.threshold;
              break;
            case 'severity_threshold':
              shouldTrigger =
                session.violations.filter(
                  (violation) => violation.severity === rule.specificSeverity,
                ).length >= rule.threshold;
              break;
          }

          if (!shouldTrigger) {
            continue;
          }

          if (rule.action === 'warn') {
            await examDeliveryService.warnStudent(
              session.id,
              `Auto-warning triggered by ${rule.triggerType}`,
              'system',
            );
          } else if (rule.action === 'pause') {
            await examDeliveryService.pauseStudentAttempt(session.id, 'system');
          } else if (rule.action === 'terminate') {
            await examDeliveryService.terminateStudentAttempt(session.id, 'system');
          }
        }
      }

      await loadMonitoringState();
    },
    [loadMonitoringState, violationRules],
  );

  return {
    alerts,
    auditLogs,
    error,
    isLoading,
    notes,
    runtimeSnapshots,
    schedules,
    sessions,
    violationRules,
    handleCompleteExam,
    handleEndSectionNow,
    handleExtendCurrentSection,
    handlePauseCohort,
    handleResumeCohort,
    handleStartScheduledSession,
    reload: loadSchedules,
    setAlerts,
    setNotes,
    setSessions,
    setViolationRules,
    evaluateViolationRules,
  };
}
