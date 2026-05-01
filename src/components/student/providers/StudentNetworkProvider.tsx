import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { saveStudentAuditEvent } from '@services/studentAuditService';
import {
  getHeartbeatIntervalMs,
  getStudentIntegritySecurityPolicy,
  hasDeviceContinuityMismatch,
} from '@services/studentIntegrityService';
import type { ExamConfig } from '../../../types';
import { getDeviceFingerprint } from '../../../utils/deviceFingerprinting';
import { useStudentAttempt } from './StudentAttemptProvider';
import { useStudentRuntime } from './StudentRuntimeProvider';

interface StudentNetworkState {
  isOnline: boolean;
  isRecovering: boolean;
  lastDisconnectAt: string | null;
  lastReconnectAt: string | null;
}

interface StudentNetworkContextValue {
  state: StudentNetworkState;
}

interface StudentNetworkProviderProps {
  children: ReactNode;
  config?: ExamConfig | undefined;
  scheduleId?: string | undefined;
  onRefreshRuntime?: (() => Promise<void>) | undefined;
}

const StudentNetworkContext = createContext<StudentNetworkContextValue | null>(null);

export function StudentNetworkProvider({
  children,
  config,
  scheduleId,
  onRefreshRuntime,
}: StudentNetworkProviderProps) {
  const { state: runtimeState, actions: runtimeActions } = useStudentRuntime();
  const { state: attemptState, actions: attemptActions } = useStudentAttempt();
  const policy = useMemo(() => getStudentIntegritySecurityPolicy(config), [config]);
  const [isOnline, setIsOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );
  const [isRecovering, setIsRecovering] = useState(false);
  const [lastDisconnectAt, setLastDisconnectAt] = useState<string | null>(
    attemptState.attempt?.integrity.lastDisconnectAt ?? null,
  );
  const [lastReconnectAt, setLastReconnectAt] = useState<string | null>(
    attemptState.attempt?.integrity.lastReconnectAt ?? null,
  );
  const missedHeartbeatsRef = useRef(0);
  const heartbeatInFlightRef = useRef(false);
  const recoveryEpochRef = useRef(0);
  const onlineInFlightRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    setLastDisconnectAt(attemptState.attempt?.integrity.lastDisconnectAt ?? null);
    setLastReconnectAt(attemptState.attempt?.integrity.lastReconnectAt ?? null);
  }, [
    attemptState.attempt?.integrity.lastDisconnectAt,
    attemptState.attempt?.integrity.lastReconnectAt,
  ]);

  const handleOffline = useCallback(async () => {
    recoveryEpochRef.current += 1;
    const timestamp = new Date().toISOString();
    setIsOnline(false);
    setIsRecovering(false);
    setLastDisconnectAt(timestamp);
    if (policy.pauseOnOffline) {
      runtimeActions.setBlockingReason('offline');
    }
    runtimeActions.setAttemptSyncState('offline');
    await attemptActions.recordNetworkStatus('offline', timestamp);
    await attemptActions
      .recordHeartbeat('disconnect', {
        reason: 'browser_offline',
      })
      .catch(() => {});
    await saveStudentAuditEvent(scheduleId, 'NETWORK_DISCONNECTED', {
      timestamp,
    }, attemptState.attemptId ?? undefined);
  }, [attemptActions, attemptState.attemptId, policy.pauseOnOffline, runtimeActions, scheduleId]);

  const verifyDeviceContinuity = useCallback(async () => {
    const attempt = attemptState.attempt;
    if (!attempt) {
      return true;
    }

    const fingerprint = await getDeviceFingerprint();
    const previousHash = attempt.integrity.deviceFingerprintHash;

    if (!previousHash) {
      await attemptActions.setDeviceFingerprintHash(fingerprint.hash);
      return true;
    }

    if (hasDeviceContinuityMismatch(previousHash, fingerprint.hash)) {
      runtimeActions.addViolation(
        'DEVICE_MISMATCH',
        'critical',
        'Device continuity check failed after reconnect.',
      );
      runtimeActions.setBlockingReason('device_mismatch');
      await saveStudentAuditEvent(scheduleId, 'DEVICE_CONTINUITY_FAILED', {
        previousHash,
        nextHash: fingerprint.hash,
      }, attemptState.attemptId ?? undefined);
      return false;
    }

    return true;
  }, [attemptActions, attemptState.attempt, attemptState.attemptId, runtimeActions, scheduleId]);

  const runReconnectRecovery = useCallback((epoch: number) => {
    if (onlineInFlightRef.current) {
      return;
    }

    const promise = (async () => {
      let retryAttempt = 0;
      try {
        while (epoch === recoveryEpochRef.current && navigator.onLine) {
          try {
            if (onRefreshRuntime) {
              await onRefreshRuntime();
              if (epoch !== recoveryEpochRef.current) {
                return;
              }
            }

            const isSameDevice = policy.requireDeviceContinuityOnReconnect
              ? await verifyDeviceContinuity()
              : true;
            if (epoch !== recoveryEpochRef.current) {
              return;
            }
            if (!isSameDevice) {
              return;
            }

            const flushed = await attemptActions.flushPending();
            if (epoch !== recoveryEpochRef.current) {
              return;
            }
            if (!flushed) {
              throw new Error('pending_flush_failed');
            }

            await attemptActions.flushHeartbeatEvents().catch(() => {});
            if (epoch !== recoveryEpochRef.current) {
              return;
            }
            runtimeActions.setBlockingReason(null);
            runtimeActions.setAttemptSyncState('saved');
            return;
          } catch {
            if (epoch !== recoveryEpochRef.current || !navigator.onLine) {
              return;
            }
            runtimeActions.setBlockingReason('syncing_reconnect');
            runtimeActions.setAttemptSyncState('syncing_reconnect');
            const retryDelayMs = Math.min(10_000, 500 * 2 ** retryAttempt);
            retryAttempt = Math.min(retryAttempt + 1, 20);
            await new Promise<void>((resolve) => {
              window.setTimeout(() => resolve(), retryDelayMs);
            });
          }
        }
      } finally {
        if (epoch === recoveryEpochRef.current) {
          setIsRecovering(false);
        }
      }
    })();

    onlineInFlightRef.current = promise;
    void promise.finally(() => {
      if (onlineInFlightRef.current === promise) {
        onlineInFlightRef.current = null;
      }
    });
  }, [
    attemptActions,
    onRefreshRuntime,
    policy.requireDeviceContinuityOnReconnect,
    runtimeActions,
    verifyDeviceContinuity,
  ]);

  const handleOnline = useCallback(() => {
    if (onlineInFlightRef.current) {
      return;
    }

    recoveryEpochRef.current += 1;
    const epoch = recoveryEpochRef.current;

    const promise = (async () => {
      const timestamp = new Date().toISOString();
      setIsOnline(true);
      setIsRecovering(true);
      setLastReconnectAt(timestamp);
      runtimeActions.setBlockingReason('syncing_reconnect');
      runtimeActions.setAttemptSyncState('syncing_reconnect');
      await attemptActions.recordNetworkStatus('online', timestamp).catch(() => {});
      if (epoch !== recoveryEpochRef.current) {
        return;
      }
      await attemptActions
        .recordHeartbeat('reconnect', {
          reason: 'browser_online',
        })
        .catch(() => {});
      if (epoch !== recoveryEpochRef.current) {
        return;
      }
      await saveStudentAuditEvent(
        scheduleId,
        'NETWORK_RECONNECTED',
        { timestamp },
        attemptState.attemptId ?? undefined,
      ).catch(() => {});
    })();

    onlineInFlightRef.current = promise;
    void promise.finally(() => {
      if (onlineInFlightRef.current === promise) {
        onlineInFlightRef.current = null;
      }
      if (epoch === recoveryEpochRef.current && navigator.onLine) {
        setIsRecovering(true);
        runReconnectRecovery(epoch);
      }
    });
  }, [
    attemptActions,
    attemptState.attemptId,
    runReconnectRecovery,
    runtimeActions,
    scheduleId,
  ]);

  const handleForegroundResume = useCallback(() => {
    if (!navigator.onLine || onlineInFlightRef.current) {
      return;
    }

    const blockedForRecovery =
      runtimeState.blocking.reason === 'syncing_reconnect' ||
      runtimeState.blocking.reason === 'offline' ||
      runtimeState.blocking.reason === 'heartbeat_lost';
    if (!blockedForRecovery) {
      return;
    }

    if (runtimeState.blocking.reason === 'offline') {
      runtimeActions.setBlockingReason('syncing_reconnect');
      runtimeActions.setAttemptSyncState('syncing_reconnect');
    }

    const epoch = recoveryEpochRef.current;
    setIsOnline(true);
    setIsRecovering(true);
    runReconnectRecovery(epoch);
  }, [
    runReconnectRecovery,
    runtimeActions,
    runtimeState.blocking.reason,
  ]);

  useEffect(() => {
    const onlineListener = () => {
      handleOnline();
    };
    const offlineListener = () => {
      void handleOffline();
    };

    window.addEventListener('online', onlineListener);
    window.addEventListener('offline', offlineListener);
    const pageShowListener = () => {
      handleForegroundResume();
    };
    const visibilityListener = () => {
      if (document.visibilityState === 'visible') {
        handleForegroundResume();
      }
    };
    window.addEventListener('pageshow', pageShowListener);
    document.addEventListener('visibilitychange', visibilityListener);

    return () => {
      window.removeEventListener('online', onlineListener);
      window.removeEventListener('offline', offlineListener);
      window.removeEventListener('pageshow', pageShowListener);
      document.removeEventListener('visibilitychange', visibilityListener);
    };
  }, [handleForegroundResume, handleOffline, handleOnline]);

  useEffect(() => {
    let cancelled = false;

    if (!attemptState.attempt) {
      return;
    }

    void (async () => {
      const fingerprint = await getDeviceFingerprint();
      if (cancelled) {
        return;
      }

      const previousHash = attemptState.attempt?.integrity.deviceFingerprintHash;
      if (!previousHash) {
        await attemptActions.setDeviceFingerprintHash(fingerprint.hash);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    attemptActions,
    attemptState.attempt?.id,
    attemptState.attempt?.integrity.deviceFingerprintHash,
    scheduleId,
  ]);

  useEffect(() => {
    if (runtimeState.phase !== 'exam' || !attemptState.attempt) {
      missedHeartbeatsRef.current = 0;
      return;
    }

    if (!isOnline) {
      return;
    }

    let cancelled = false;
    const intervalMs = getHeartbeatIntervalMs(policy);

    const intervalId = window.setInterval(() => {
      void (async () => {
        if (heartbeatInFlightRef.current) {
          return;
        }

        heartbeatInFlightRef.current = true;

        try {
          await attemptActions.recordHeartbeat('heartbeat');
          if (cancelled) {
            return;
          }

          missedHeartbeatsRef.current = 0;

          if (runtimeState.blocking.reason === 'heartbeat_lost') {
            runtimeActions.setBlockingReason(null);
          }
        } catch {
          if (cancelled) {
            return;
          }

          missedHeartbeatsRef.current += 1;

          const warningThreshold = config?.security.heartbeatWarningThreshold ?? 2;
          const hardBlockThreshold = config?.security.heartbeatHardBlockThreshold ?? 4;

          if (missedHeartbeatsRef.current === warningThreshold) {
            void saveStudentAuditEvent(
              scheduleId,
              'HEARTBEAT_MISSED',
              {
                missedCount: missedHeartbeatsRef.current,
                threshold: warningThreshold,
                intervalSeconds: Math.round(intervalMs / 1_000),
              },
              attemptState.attemptId ?? undefined,
            );
          }

          if (missedHeartbeatsRef.current === hardBlockThreshold) {
            runtimeActions.addViolation(
              'HEARTBEAT_LOST',
              'high',
              `Heartbeat delivery failed after ${missedHeartbeatsRef.current} attempts.`,
            );
            runtimeActions.setBlockingReason('heartbeat_lost');
            void attemptActions
              .recordHeartbeat('lost', {
                reason: 'delivery_failed',
                missedCount: missedHeartbeatsRef.current,
              })
              .catch(() => {});
            void saveStudentAuditEvent(
              scheduleId,
              'HEARTBEAT_LOST',
              {
                missedCount: missedHeartbeatsRef.current,
                threshold: hardBlockThreshold,
                intervalSeconds: Math.round(intervalMs / 1_000),
              },
              attemptState.attemptId ?? undefined,
            );
          }
        } finally {
          heartbeatInFlightRef.current = false;
        }
      })();
    }, intervalMs);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [
    attemptActions,
    attemptState.attempt,
    attemptState.attemptId,
    config?.security.heartbeatHardBlockThreshold,
    config?.security.heartbeatWarningThreshold,
    isOnline,
    policy,
    runtimeActions,
    runtimeState.blocking.reason,
    runtimeState.phase,
    scheduleId,
  ]);

  const value = useMemo<StudentNetworkContextValue>(() => ({
    state: {
      isOnline,
      isRecovering,
      lastDisconnectAt,
      lastReconnectAt,
    },
  }), [isOnline, isRecovering, lastDisconnectAt, lastReconnectAt]);

  return (
    <StudentNetworkContext.Provider value={value}>
      {children}
    </StudentNetworkContext.Provider>
  );
}

export function useStudentNetwork() {
  const context = useContext(StudentNetworkContext);
  if (!context) {
    throw new Error('useStudentNetwork must be used within StudentNetworkProvider');
  }
  return context;
}
