import { compareFreshnessDimension, type LiveSnapshotFreshness } from '../liveSnapshotFreshness';
import type { StudentObservabilityField } from '../../../utils/studentObservability';

export interface StudentAnswerInvariantRolloutState {
  enabled: boolean;
  killSwitch: boolean;
  cohort: string | null;
  configFingerprint: string | null;
  source: 'default' | 'runtime';
}

export interface StudentSessionMachineEventContext {
  applyEpoch: number;
  currentEpoch: number;
  scheduleId: string | null;
  attemptId: string | null;
  syncState: string;
  source: 'refresh' | 'load';
  rollout: StudentAnswerInvariantRolloutState;
  incomingFreshness: LiveSnapshotFreshness;
  appliedFreshness: LiveSnapshotFreshness | null;
}

export interface StudentSessionMachineDecision {
  discardAll: boolean;
  applyAttempt: boolean;
  applyRuntime: boolean;
}

export interface StudentSessionMetricCommand {
  type: 'emit_metric';
  name: string;
  dimensions: Record<string, StudentObservabilityField>;
}

export interface StudentSessionMachineTransitionResult {
  decision: StudentSessionMachineDecision;
  commands: StudentSessionMetricCommand[];
}

export interface StudentSessionLoadTransitionContext {
  scheduleId: string | null;
  attemptId: string | null;
  source: 'load' | 'retry';
  rollout: StudentAnswerInvariantRolloutState;
}

export type StudentSessionLoadTransitionEvent =
  | { type: 'requested' }
  | { type: 'succeeded' }
  | { type: 'failed'; error: string };

export interface StudentSessionLoadTransitionDecision {
  isLoading: boolean;
  error: string | null;
}

export interface StudentSessionLoadTransitionResult {
  decision: StudentSessionLoadTransitionDecision;
  commands: StudentSessionMetricCommand[];
}

const LIVE_SESSION_STATUS_CODE = 200;

function buildLiveEndpoint(scheduleId: string | null): string | null {
  return scheduleId ? `/v1/student/sessions/${scheduleId}/live` : null;
}

function metricCommand(
  name: string,
  context: StudentSessionMachineEventContext,
  reason: string,
): StudentSessionMetricCommand {
  const rolloutEnabled = context.rollout.enabled && !context.rollout.killSwitch;
  return {
    type: 'emit_metric',
    name,
    dimensions: {
      scheduleId: context.scheduleId,
      attemptId: context.attemptId,
      endpoint: buildLiveEndpoint(context.scheduleId),
      statusCode: LIVE_SESSION_STATUS_CODE,
      reason,
      syncState: context.syncState,
      source: context.source,
      rolloutCohort: context.rollout.cohort,
      answerInvariantEnabled: rolloutEnabled,
      answerInvariantSource: context.rollout.source,
    },
  };
}

export function evaluateLiveSnapshotTransition(
  context: StudentSessionMachineEventContext,
): StudentSessionMachineTransitionResult {
  if (context.applyEpoch !== context.currentEpoch) {
    return {
      decision: {
        discardAll: true,
        applyAttempt: false,
        applyRuntime: false,
      },
      commands: [metricCommand('student_refresh_stale_discard_total', context, 'epoch_superseded')],
    };
  }

  if (!context.appliedFreshness) {
    return {
      decision: {
        discardAll: false,
        applyAttempt: true,
        applyRuntime: true,
      },
      commands: [],
    };
  }

  const attemptOrder = compareFreshnessDimension(
    context.incomingFreshness.attempt,
    context.appliedFreshness.attempt,
  );
  const runtimeOrder = compareFreshnessDimension(
    context.incomingFreshness.runtime,
    context.appliedFreshness.runtime,
  );
  const commands: StudentSessionMetricCommand[] = [];

  if (runtimeOrder < 0) {
    commands.push(metricCommand('student_runtime_revision_regression_total', context, 'runtime_regressed'));
  }

  if (attemptOrder < 0 && runtimeOrder < 0) {
    commands.push(
      metricCommand('student_refresh_stale_discard_total', context, 'attempt_and_runtime_regressed'),
    );
    return {
      decision: {
        discardAll: true,
        applyAttempt: false,
        applyRuntime: false,
      },
      commands,
    };
  }

  if (attemptOrder < 0 || runtimeOrder < 0) {
    commands.push(
      metricCommand(
        'student_refresh_stale_discard_total',
        context,
        attemptOrder < 0 ? 'attempt_regressed' : 'runtime_regressed',
      ),
    );
  }

  return {
    decision: {
      discardAll: false,
      applyAttempt: attemptOrder >= 0,
      applyRuntime: runtimeOrder >= 0,
    },
    commands,
  };
}

export function evaluateLoadTransition(
  context: StudentSessionLoadTransitionContext,
  event: StudentSessionLoadTransitionEvent,
): StudentSessionLoadTransitionResult {
  if (event.type === 'requested') {
    return {
      decision: {
        isLoading: true,
        error: null,
      },
      commands: [],
    };
  }

  if (event.type === 'succeeded') {
    return {
      decision: {
        isLoading: false,
        error: null,
      },
      commands: [],
    };
  }

  return {
    decision: {
      isLoading: false,
      error: event.error,
    },
    commands: [
      {
        type: 'emit_metric',
        name: 'student_session_load_failed_total',
        dimensions: {
          scheduleId: context.scheduleId,
          attemptId: context.attemptId,
          endpoint: buildLiveEndpoint(context.scheduleId),
          statusCode: LIVE_SESSION_STATUS_CODE,
          reason: event.error,
          syncState: 'idle',
          source: context.source,
          rolloutCohort: context.rollout.cohort,
          answerInvariantEnabled: context.rollout.enabled && !context.rollout.killSwitch,
          answerInvariantSource: context.rollout.source,
        },
      },
    ],
  };
}
