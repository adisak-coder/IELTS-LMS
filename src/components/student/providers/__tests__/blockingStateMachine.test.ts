import { describe, expect, it } from 'vitest';
import {
  createBlockingMachineState,
  syncProctorBlockingMachine,
  transitionBlockingMachine,
} from '../blockingStateMachine';

describe('blockingStateMachine', () => {
  it('treats connectivity and integrity reasons as non-blocking signals', () => {
    let state = createBlockingMachineState();

    state = transitionBlockingMachine(state, 'offline', true);
    expect(state.current).toBeNull();

    state = transitionBlockingMachine(state, 'syncing_reconnect', true);
    expect(state.current).toBeNull();

    state = transitionBlockingMachine(state, 'heartbeat_lost', true);
    expect(state.current).toBeNull();

    state = transitionBlockingMachine(state, 'device_mismatch', true);
    expect(state.current).toBeNull();
  });

  it('keeps higher-priority proctor pause while clearing offline', () => {
    let state = createBlockingMachineState();
    state = transitionBlockingMachine(state, 'offline', true);
    state = transitionBlockingMachine(state, 'proctor_paused', true);

    expect(state.current).toBe('proctor_paused');

    state = transitionBlockingMachine(state, 'offline', false);
    expect(state.current).toBe('proctor_paused');
  });

  it('applies documented priority ordering for true blocking reasons', () => {
    let state = createBlockingMachineState();
    state = transitionBlockingMachine(state, 'storage_unavailable', true);
    state = transitionBlockingMachine(state, 'proctor_paused', true);

    expect(state.current).toBe('proctor_paused');
  });

  it('syncs proctor pause from proctor status', () => {
    let state = createBlockingMachineState();

    state = syncProctorBlockingMachine(state, 'paused');
    expect(state.current).toBe('proctor_paused');

    state = syncProctorBlockingMachine(state, 'active');
    expect(state.current).toBeNull();
  });
});
