import { describe, expect, it, vi } from 'vitest';
import { createDefaultConfig } from '../../constants/examDefaults';
import {
  buildStudentHeartbeatEvent,
  getHeartbeatIntervalMs,
  getHeartbeatLossTimeoutMs,
  getStudentIntegritySecurityPolicy,
  hasDeviceContinuityMismatch,
} from '../studentIntegrityService';

describe('student integrity policy', () => {
  it('uses defaults when heartbeat settings are missing', () => {
    const config = createDefaultConfig('Academic', 'Academic');
    config.security.heartbeatIntervalSeconds = undefined;
    config.security.heartbeatMissThreshold = undefined;

    expect(getHeartbeatIntervalMs(config)).toBe(15_000);
    expect(getHeartbeatLossTimeoutMs(config)).toBe(45_000);
  });

  it('respects security overrides when provided', () => {
    const config = createDefaultConfig('Academic', 'Academic');
    config.security.heartbeatIntervalSeconds = 10;
    config.security.heartbeatMissThreshold = 2;
    config.security.pauseOnOffline = false;
    config.security.bufferAnswersOffline = false;
    config.security.requireDeviceContinuityOnReconnect = false;
    config.security.allowSafariWithAcknowledgement = false;

    const policy = getStudentIntegritySecurityPolicy(config);
    expect(policy.heartbeatIntervalSeconds).toBe(10);
    expect(policy.heartbeatMissThreshold).toBe(2);
    expect(policy.pauseOnOffline).toBe(false);
    expect(policy.bufferAnswersOffline).toBe(false);
    expect(policy.requireDeviceContinuityOnReconnect).toBe(false);
    expect(policy.allowSafariWithAcknowledgement).toBe(false);
  });

  it('detects device continuity mismatches', () => {
    expect(hasDeviceContinuityMismatch('a', 'b')).toBe(true);
    expect(hasDeviceContinuityMismatch('a', 'a')).toBe(false);
    expect(hasDeviceContinuityMismatch(null, 'a')).toBe(false);
  });

  it('buildStudentHeartbeatEvent is deterministic with fixed clock', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1710000000000);
    vi.spyOn(Math, 'random').mockReturnValue(0.12345);

    const event = buildStudentHeartbeatEvent(
      'attempt-1',
      'schedule-1',
      'heartbeat',
      { seq: 1 },
      '2026-01-01T00:00:00.000Z',
    );

    expect(event).toEqual(
      expect.objectContaining({
        attemptId: 'attempt-1',
        scheduleId: 'schedule-1',
        type: 'heartbeat',
        payload: { seq: 1 },
        timestamp: '2026-01-01T00:00:00.000Z',
      }),
    );
    expect(event.id.startsWith('heartbeat-')).toBe(true);
  });
});

