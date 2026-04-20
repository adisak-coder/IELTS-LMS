import { describe, expect, it, vi } from 'vitest';
import { createLatestOnlyAsyncRunner } from '../latestOnlyAsync';

describe('createLatestOnlyAsyncRunner', () => {
  it('runs tasks sequentially and coalesces to the latest value', async () => {
    const events: string[] = [];
    let inFlight = 0;
    let maxInFlight = 0;

    const run = vi.fn(async (value: string) => {
      events.push(`start:${value}`);
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await Promise.resolve();
      await Promise.resolve();
      inFlight -= 1;
      events.push(`end:${value}`);
    });

    const runner = createLatestOnlyAsyncRunner(run);

    runner.enqueue('A');
    runner.enqueue('B');
    runner.enqueue('C');

    await runner.idle();

    expect(maxInFlight).toBe(1);
    expect(run).toHaveBeenCalledTimes(2);
    expect(run).toHaveBeenNthCalledWith(1, 'A');
    expect(run).toHaveBeenNthCalledWith(2, 'C');
    expect(events).toEqual(['start:A', 'end:A', 'start:C', 'end:C']);
  });

  it('exposes the last error and continues processing later enqueues', async () => {
    const run = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(undefined);

    const runner = createLatestOnlyAsyncRunner(run);
    runner.enqueue('A');
    await runner.idle();

    expect(runner.lastError?.message).toBe('boom');

    runner.enqueue('B');
    await runner.idle();

    expect(run).toHaveBeenCalledTimes(2);
    expect(runner.lastError).toBeNull();
  });
});

