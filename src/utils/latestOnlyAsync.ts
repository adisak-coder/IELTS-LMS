export interface LatestOnlyAsyncRunner<T> {
  enqueue: (value: T) => void;
  idle: () => Promise<void>;
  lastError: Error | null;
}

export function createLatestOnlyAsyncRunner<T>(
  run: (value: T) => Promise<void>,
): LatestOnlyAsyncRunner<T> {
  let running = false;
  let queued: { value: T; hasValue: boolean } = { value: undefined as T, hasValue: false };
  let idlePromise: Promise<void> | null = null;
  let resolveIdle: (() => void) | null = null;

  const runner: LatestOnlyAsyncRunner<T> = {
    lastError: null,
    enqueue(value) {
      if (!running) {
        running = true;
        idlePromise =
          idlePromise ??
          new Promise<void>((resolve) => {
            resolveIdle = resolve;
          });

        void (async () => {
          let current: T = value;
          try {
            while (true) {
              try {
                await run(current);
                runner.lastError = null;
              } catch (error) {
                runner.lastError = error instanceof Error ? error : new Error('Unknown error');
              }

              if (!queued.hasValue) {
                return;
              }

              current = queued.value;
              queued = { value: undefined as T, hasValue: false };
            }
          } finally {
            running = false;
            resolveIdle?.();
            resolveIdle = null;
            idlePromise = null;
          }
        })();

        return;
      }

      queued = { value, hasValue: true };
    },
    idle() {
      return idlePromise ?? Promise.resolve();
    },
  };

  return runner;
}

