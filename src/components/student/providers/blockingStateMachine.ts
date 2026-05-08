import type { StudentAttempt } from '../../../types/studentAttempt';

export type ManagedBlockingReason =
  | 'offline'
  | 'syncing_reconnect'
  | 'storage_unavailable'
  | 'device_mismatch'
  | 'proctor_paused'
  | 'heartbeat_lost';

type BlockingFlags = Record<ManagedBlockingReason, boolean>;

export interface BlockingMachineState {
  flags: BlockingFlags;
  current: ManagedBlockingReason | null;
}

const NON_BLOCKING_INTEGRITY_REASONS = new Set<ManagedBlockingReason>([
  'offline',
  'syncing_reconnect',
  'heartbeat_lost',
  'device_mismatch',
]);

const PRIORITY: ManagedBlockingReason[] = [
  'device_mismatch',
  'proctor_paused',
  'offline',
  'heartbeat_lost',
  'syncing_reconnect',
  'storage_unavailable',
];

function resolveCurrent(flags: BlockingFlags): ManagedBlockingReason | null {
  for (const reason of PRIORITY) {
    if (flags[reason]) {
      return reason;
    }
  }
  return null;
}

function cloneFlags(flags: BlockingFlags): BlockingFlags {
  return {
    offline: flags.offline,
    syncing_reconnect: flags.syncing_reconnect,
    storage_unavailable: flags.storage_unavailable,
    device_mismatch: flags.device_mismatch,
    proctor_paused: flags.proctor_paused,
    heartbeat_lost: flags.heartbeat_lost,
  };
}

export function createBlockingMachineState(initial?: ManagedBlockingReason | null): BlockingMachineState {
  const flags: BlockingFlags = {
    offline: false,
    syncing_reconnect: false,
    storage_unavailable: false,
    device_mismatch: false,
    proctor_paused: false,
    heartbeat_lost: false,
  };

  if (initial) {
    flags[initial] = true;
  }

  return {
    flags,
    current: resolveCurrent(flags),
  };
}

export function transitionBlockingMachine(
  previous: BlockingMachineState,
  reason: ManagedBlockingReason,
  active = true,
): BlockingMachineState {
  if (NON_BLOCKING_INTEGRITY_REASONS.has(reason)) {
    return previous;
  }

  const flags = cloneFlags(previous.flags);

  if (active) {
    switch (reason) {
      case 'offline':
        flags.offline = true;
        flags.syncing_reconnect = false;
        break;
      case 'syncing_reconnect':
        flags.syncing_reconnect = true;
        flags.offline = false;
        break;
      case 'heartbeat_lost':
        flags.heartbeat_lost = true;
        flags.syncing_reconnect = false;
        break;
      default:
        flags[reason] = true;
        break;
    }
  } else {
    switch (reason) {
      case 'offline':
        flags.offline = false;
        flags.syncing_reconnect = false;
        break;
      default:
        flags[reason] = false;
        break;
    }
  }

  return {
    flags,
    current: resolveCurrent(flags),
  };
}

export function syncProctorBlockingMachine(
  previous: BlockingMachineState,
  proctorStatus: StudentAttempt['proctorStatus'],
): BlockingMachineState {
  if (proctorStatus === 'paused') {
    if (previous.flags.proctor_paused) {
      return previous;
    }
    return transitionBlockingMachine(previous, 'proctor_paused', true);
  }

  if (!previous.flags.proctor_paused) {
    return previous;
  }

  return transitionBlockingMachine(previous, 'proctor_paused', false);
}
