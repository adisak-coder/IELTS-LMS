import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useAsyncPolling } from '@app/hooks/useAsyncPolling';
import { useLiveUpdates, type LiveUpdateEvent } from '@app/hooks/useLiveUpdates';
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
import type { ProctorScheduleMetrics } from '../contracts';

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
  scheduleMetrics: Record<string, ProctorScheduleMetrics>;
  sessions: StudentSession[];
  selectedScheduleId: string | null;
  setSelectedScheduleId: Dispatch<SetStateAction<string | null>>;
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
  const [scheduleMetrics, setScheduleMetrics] = useState<Record<string, ProctorScheduleMetrics>>(
    {},
  );
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pollIntervalMs, setPollIntervalMs] = useState(4_000);
  const [hasHydrated, setHasHydrated] = useState(false);

  const loadMonitoringState = useCallback(async () => {
    const summaries = await backendGet<
      Array<{
        schedule: Parameters<typeof mapBackendSchedule>[0];
        runtime: Parameters<typeof mapBackendRuntime>[0];
        studentCount?: number | undefined;
        activeCount?: number | undefined;
        alertCount?: number | undefined;
        violationCount?: number | undefined;
        degradedLiveMode: boolean;
      }>
    >('/v1/proctor/sessions');

    if (summaries.length === 0) {
      setSchedules([]);
      setRuntimeSnapshots([]);
      setScheduleMetrics({});
      setSessions([]);
      setAlerts([]);
      setAuditLogs([]);
      setNotes([]);
      setViolationRules([]);
      setPollIntervalMs(4_000);
      return;
    }

    const metrics: Record<string, ProctorScheduleMetrics> = {};
    for (const summary of summaries) {
      metrics[summary.schedule.id] = {
        studentCount: summary.studentCount ?? 0,
        activeCount: summary.activeCount ?? 0,
        alertCount: summary.alertCount ?? 0,
        violationCount: summary.violationCount ?? 0,
        degradedLiveMode: summary.degradedLiveMode,
      };
    }

    setPollIntervalMs(summaries.some((summary) => summary.degradedLiveMode) ? 1_000 : 4_000);
    setScheduleMetrics(metrics);
    setSchedules(summaries.map((summary) => mapBackendSchedule(summary.schedule)));
    setRuntimeSnapshots(
      summaries.map((summary) => mapBackendRuntime(summary.runtime, mapBackendSchedule(summary.schedule))),
    );

    const detailScheduleIds = new Set<string>();
    for (const summary of summaries) {
      const status = summary.runtime?.status;
      if (status === 'live' || status === 'paused') {
        detailScheduleIds.add(summary.schedule.id);
      }
    }
    if (selectedScheduleId) {
      detailScheduleIds.add(selectedScheduleId);
    }

    type ProctorSessionDetailPayload = {
      schedule: Parameters<typeof mapBackendSchedule>[0];
      runtime: Parameters<typeof mapBackendRuntime>[0];
      sessions: Array<Parameters<typeof mapBackendSessionSummary>[0]>;
      alerts: Array<Parameters<typeof mapBackendAlert>[0]>;
      auditLogs: Array<Parameters<typeof mapBackendAuditLog>[0]>;
      notes: Array<Parameters<typeof mapBackendNote>[0]>;
      presence: Array<Parameters<typeof mapBackendProctorPresence>[0]>;
      violationRules: Array<Parameters<typeof mapBackendViolationRule>[0]>;
      degradedLiveMode: boolean;
    };

    const detailResults = await Promise.allSettled(
      [...detailScheduleIds].map((scheduleId) =>
        backendGet<ProctorSessionDetailPayload>(`/v1/proctor/sessions/${scheduleId}`),
      ),
    );

    const details: ProctorSessionDetailPayload[] = [];
    for (const result of detailResults) {
      if (result.status === 'fulfilled') {
        details.push(result.value);
      }
    }

    setRuntimeSnapshots((current) => {
      const bySchedule = new Map(current.map((runtime) => [runtime.scheduleId, runtime]));
      for (const detail of details) {
        const schedule = mapBackendSchedule(detail.schedule);
        bySchedule.set(detail.schedule.id, {
          ...mapBackendRuntime(detail.runtime, schedule),
          proctorPresence: (detail.presence ?? []).map(mapBackendProctorPresence),
        });
      }
      return [...bySchedule.values()];
    });

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
  }, [selectedScheduleId]);

  const refresh = useCallback(async () => {
    try {
      await loadMonitoringState();
      setHasHydrated(true);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load proctor data');
      throw loadError;
    }
  }, [loadMonitoringState]);

  const handleLiveUpdate = useCallback(
    (_event: LiveUpdateEvent) => {
      void refresh();
    },
    [refresh],
  );

  useLiveUpdates({ onEvent: handleLiveUpdate });

  useEffect(() => {
    void refresh().finally(() => {
      setIsLoading(false);
    });
  }, [refresh]);

  useEffect(() => {
    if (!hasHydrated || !selectedScheduleId) {
      return;
    }

    void refresh();
  }, [hasHydrated, refresh, selectedScheduleId]);

  useAsyncPolling(refresh, {
    enabled: true,
    intervalMs: pollIntervalMs,
    maxIntervalMs: Math.max(pollIntervalMs * 8, 30_000),
    runImmediately: false,
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
      const runtime = runtimeSnapshots.find((candidate) => candidate.scheduleId === scheduleId);
      const expectedActiveSectionKey = runtime?.activeSectionKey ?? runtime?.currentSectionKey ?? undefined;
      const result = await examDeliveryService.endCurrentSectionNow(
        scheduleId,
        'Proctor',
        expectedActiveSectionKey,
      );
      if (!result.success) {
        setError(result.error ?? 'Failed to end section');
      } else {
        setError(null);
      }
      await loadMonitoringState();
    },
    [loadMonitoringState, runtimeSnapshots],
  );

  const handleExtendCurrentSection = useCallback(
    async (scheduleId: string, minutes: number) => {
      const runtime = runtimeSnapshots.find((candidate) => candidate.scheduleId === scheduleId);
      const expectedActiveSectionKey = runtime?.activeSectionKey ?? runtime?.currentSectionKey ?? undefined;
      const result = await examDeliveryService.extendCurrentSection(
        scheduleId,
        'Proctor',
        minutes,
        expectedActiveSectionKey,
      );
      if (!result.success) {
        setError(result.error ?? 'Failed to extend section');
      } else {
        setError(null);
      }
      await loadMonitoringState();
    },
    [loadMonitoringState, runtimeSnapshots],
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
    scheduleMetrics,
    sessions,
    selectedScheduleId,
    setSelectedScheduleId,
    violationRules,
    handleCompleteExam,
    handleEndSectionNow,
    handleExtendCurrentSection,
    handlePauseCohort,
    handleResumeCohort,
    handleStartScheduledSession,
    reload: refresh,
    setAlerts,
    setNotes,
    setSessions,
    setViolationRules,
    evaluateViolationRules,
  };
}
