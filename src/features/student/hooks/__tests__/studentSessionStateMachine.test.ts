import { describe, expect, it } from 'vitest';
import type { LiveSnapshotFreshness } from '../../liveSnapshotFreshness';
import {
  evaluateLoadTransition,
  evaluateLiveSnapshotTransition,
  type StudentSessionMachineEventContext,
} from '../studentSessionStateMachine';

function freshness(args: {
  attemptRevision: number | null;
  attemptUpdatedAtMs: number | null;
  runtimeRevision: number | null;
  runtimeUpdatedAtMs: number | null;
}): LiveSnapshotFreshness {
  return {
    attempt: {
      revision: args.attemptRevision,
      updatedAtMs: args.attemptUpdatedAtMs,
    },
    runtime: {
      revision: args.runtimeRevision,
      updatedAtMs: args.runtimeUpdatedAtMs,
    },
  };
}

function buildContext(overrides?: Partial<StudentSessionMachineEventContext>): StudentSessionMachineEventContext {
  return {
    applyEpoch: 2,
    currentEpoch: 2,
    scheduleId: 'sched-1',
    attemptId: 'attempt-1',
    syncState: 'idle',
    source: 'refresh',
    rollout: {
      enabled: true,
      killSwitch: false,
      cohort: null,
      configFingerprint: null,
      source: 'runtime',
    },
    incomingFreshness: freshness({
      attemptRevision: 3,
      attemptUpdatedAtMs: 3000,
      runtimeRevision: 3,
      runtimeUpdatedAtMs: 3000,
    }),
    appliedFreshness: freshness({
      attemptRevision: 2,
      attemptUpdatedAtMs: 2000,
      runtimeRevision: 2,
      runtimeUpdatedAtMs: 2000,
    }),
    ...overrides,
  };
}

describe('studentSessionStateMachine', () => {
  it('marks load requested as loading with cleared error', () => {
    const result = evaluateLoadTransition(
      {
        scheduleId: 'sched-1',
        attemptId: null,
        source: 'load',
        rollout: {
          enabled: true,
          killSwitch: false,
          cohort: null,
          configFingerprint: null,
          source: 'default',
        },
      },
      { type: 'requested' },
    );

    expect(result.decision).toEqual({
      isLoading: true,
      error: null,
    });
    expect(result.commands).toHaveLength(0);
  });

  it('emits load failure metric on retry failure', () => {
    const result = evaluateLoadTransition(
      {
        scheduleId: 'sched-1',
        attemptId: 'attempt-1',
        source: 'retry',
        rollout: {
          enabled: true,
          killSwitch: false,
          cohort: 'canary',
          configFingerprint: 'cfg-1',
          source: 'runtime',
        },
      },
      { type: 'failed', error: 'Transient backend outage' },
    );

    expect(result.decision).toEqual({
      isLoading: false,
      error: 'Transient backend outage',
    });
    expect(result.commands).toEqual([
      expect.objectContaining({
        type: 'emit_metric',
        name: 'student_session_load_failed_total',
      }),
    ]);
  });

  it('applies equal runtime freshness', () => {
    const result = evaluateLiveSnapshotTransition(
      buildContext({
        incomingFreshness: freshness({
          attemptRevision: 3,
          attemptUpdatedAtMs: 3000,
          runtimeRevision: 2,
          runtimeUpdatedAtMs: 2000,
        }),
        appliedFreshness: freshness({
          attemptRevision: 2,
          attemptUpdatedAtMs: 2000,
          runtimeRevision: 2,
          runtimeUpdatedAtMs: 2000,
        }),
      }),
    );

    expect(result.decision).toEqual({
      discardAll: false,
      applyAttempt: true,
      applyRuntime: true,
    });
  });

  it('applies newer runtime freshness', () => {
    const result = evaluateLiveSnapshotTransition(
      buildContext({
        incomingFreshness: freshness({
          attemptRevision: 2,
          attemptUpdatedAtMs: 2000,
          runtimeRevision: 5,
          runtimeUpdatedAtMs: 5000,
        }),
        appliedFreshness: freshness({
          attemptRevision: 2,
          attemptUpdatedAtMs: 2000,
          runtimeRevision: 4,
          runtimeUpdatedAtMs: 4000,
        }),
      }),
    );

    expect(result.decision).toEqual({
      discardAll: false,
      applyAttempt: true,
      applyRuntime: true,
    });
  });

  it('applies equal attempt freshness', () => {
    const result = evaluateLiveSnapshotTransition(
      buildContext({
        incomingFreshness: freshness({
          attemptRevision: 8,
          attemptUpdatedAtMs: 8000,
          runtimeRevision: 3,
          runtimeUpdatedAtMs: 3000,
        }),
        appliedFreshness: freshness({
          attemptRevision: 8,
          attemptUpdatedAtMs: 8000,
          runtimeRevision: 3,
          runtimeUpdatedAtMs: 3000,
        }),
      }),
    );

    expect(result.decision).toEqual({
      discardAll: false,
      applyAttempt: true,
      applyRuntime: true,
    });
  });

  it('applies newer attempt freshness', () => {
    const result = evaluateLiveSnapshotTransition(
      buildContext({
        incomingFreshness: freshness({
          attemptRevision: 11,
          attemptUpdatedAtMs: 11000,
          runtimeRevision: 3,
          runtimeUpdatedAtMs: 3000,
        }),
        appliedFreshness: freshness({
          attemptRevision: 10,
          attemptUpdatedAtMs: 10000,
          runtimeRevision: 3,
          runtimeUpdatedAtMs: 3000,
        }),
      }),
    );

    expect(result.decision).toEqual({
      discardAll: false,
      applyAttempt: true,
      applyRuntime: true,
    });
  });

  it('discards stale refresh when both attempt and runtime regress', () => {
    const result = evaluateLiveSnapshotTransition(
      buildContext({
        incomingFreshness: freshness({
          attemptRevision: 1,
          attemptUpdatedAtMs: 1000,
          runtimeRevision: 1,
          runtimeUpdatedAtMs: 1000,
        }),
      }),
    );

    expect(result.decision).toEqual({
      discardAll: true,
      applyAttempt: false,
      applyRuntime: false,
    });
    expect(
      result.commands.some(
        (command: { name: string }) => command.name === 'student_refresh_stale_discard_total',
      ),
    ).toBe(true);
  });

  it('applies fresher attempt while blocking regressed runtime', () => {
    const result = evaluateLiveSnapshotTransition(
      buildContext({
        incomingFreshness: freshness({
          attemptRevision: 3,
          attemptUpdatedAtMs: 3000,
          runtimeRevision: 1,
          runtimeUpdatedAtMs: 1000,
        }),
      }),
    );

    expect(result.decision).toEqual({
      discardAll: false,
      applyAttempt: true,
      applyRuntime: false,
    });
  });

  it('discards superseded epoch responses', () => {
    const result = evaluateLiveSnapshotTransition(
      buildContext({
        applyEpoch: 2,
        currentEpoch: 3,
      }),
    );

    expect(result.decision).toEqual({
      discardAll: true,
      applyAttempt: false,
      applyRuntime: false,
    });
  });
});
