import type {
  AttemptSyncState,
  StudentAttempt,
  StudentAttemptMutation,
  StudentAttemptMutationType,
} from '../types/studentAttempt';

const ANSWER_SYNC_CHECKPOINT_KEY_PREFIX = 'ielts_student_answer_checkpoint_v1';

export type DurablePersistTriggerSource =
  | 'mutation'
  | 'debounce_timer'
  | 'focusout'
  | 'visibility_hidden'
  | 'pagehide'
  | 'beforeunload'
  | 'freeze'
  | 'window_blur'
  | 'hydrate_checkpoint'
  | 'dom_rescue_commit';

export function isAnswerMutationType(type: StudentAttemptMutationType): boolean {
  return type === 'answer' || type === 'writing_answer';
}

export type PendingMutationDurableWriteMode = 'immediate' | 'debounced';

export type PendingMutationFlushKind = 'objective' | 'writing';

export function getMutationCoalesceKey(mutation: StudentAttemptMutation): string | null {
  switch (mutation.type) {
    case 'answer': {
      const questionId = (mutation.payload as { questionId?: unknown } | undefined)?.questionId;
      if (!(typeof questionId === 'string' && questionId.trim())) {
        return null;
      }

      const slotIndex = (mutation.payload as { slotIndex?: unknown } | undefined)?.slotIndex;
      if (typeof slotIndex === 'number' && Number.isInteger(slotIndex) && slotIndex >= 0) {
        return `answer:${questionId}:slot:${slotIndex}`;
      }

      return `answer:${questionId}`;
    }
    case 'writing_answer': {
      const taskId = (mutation.payload as { taskId?: unknown } | undefined)?.taskId;
      return typeof taskId === 'string' && taskId.trim() ? `writing_answer:${taskId}` : null;
    }
    case 'flag': {
      const questionId = (mutation.payload as { questionId?: unknown } | undefined)?.questionId;
      return typeof questionId === 'string' && questionId.trim() ? `flag:${questionId}` : null;
    }
    case 'position':
    case 'network':
    case 'device_fingerprint':
      return mutation.type;
    case 'violation':
    case 'precheck':
    case 'heartbeat':
    case 'sync':
    default:
      return null;
  }
}

export function coalescePendingMutations(
  pending: StudentAttemptMutation[],
  nextMutation: StudentAttemptMutation,
): StudentAttemptMutation[] {
  const coalesceKey = getMutationCoalesceKey(nextMutation);
  if (!coalesceKey) {
    return [...pending, nextMutation];
  }

  const filtered = pending.filter((existing) => getMutationCoalesceKey(existing) !== coalesceKey);
  return [...filtered, nextMutation];
}

interface AnswerSyncCheckpointRecord {
  attemptId: string;
  savedAt: string;
  mutationVersion: number;
  mutations: StudentAttemptMutation[];
}

function checkpointStorageKey(attemptId: string): string {
  return `${ANSWER_SYNC_CHECKPOINT_KEY_PREFIX}:${attemptId}`;
}

function readCheckpointStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') {
      return null;
    }
    return window.localStorage;
  } catch {
    return null;
  }
}

function isCheckpointEligibleMutationType(type: StudentAttemptMutationType): boolean {
  return type === 'answer' || type === 'writing_answer' || type === 'flag';
}

function isCheckpointRecord(candidate: unknown): candidate is AnswerSyncCheckpointRecord {
  if (!candidate || typeof candidate !== 'object') {
    return false;
  }

  const parsed = candidate as Partial<AnswerSyncCheckpointRecord>;
  return (
    typeof parsed.attemptId === 'string' &&
    typeof parsed.savedAt === 'string' &&
    typeof parsed.mutationVersion === 'number' &&
    Number.isFinite(parsed.mutationVersion) &&
    Array.isArray(parsed.mutations)
  );
}

export function writeAnswerSyncCheckpoint(
  attemptId: string,
  mutationVersion: number,
  mutations: StudentAttemptMutation[],
): boolean {
  const storage = readCheckpointStorage();
  if (!storage) {
    return false;
  }

  try {
    const eligibleMutations = mutations.filter((mutation) =>
      isCheckpointEligibleMutationType(mutation.type),
    );
    const key = checkpointStorageKey(attemptId);
    if (eligibleMutations.length === 0) {
      storage.removeItem(key);
      return true;
    }

    const payload: AnswerSyncCheckpointRecord = {
      attemptId,
      savedAt: new Date().toISOString(),
      mutationVersion,
      mutations: eligibleMutations,
    };
    storage.setItem(key, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function readAnswerSyncCheckpoint(attemptId: string): StudentAttemptMutation[] {
  const storage = readCheckpointStorage();
  if (!storage) {
    return [];
  }

  try {
    const raw = storage.getItem(checkpointStorageKey(attemptId));
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!isCheckpointRecord(parsed) || parsed.attemptId !== attemptId) {
      return [];
    }

    return parsed.mutations.filter((mutation) => isCheckpointEligibleMutationType(mutation.type));
  } catch {
    return [];
  }
}

function shouldDebounceAnswerDurability(mutation: StudentAttemptMutation): boolean {
  if (mutation.type === 'writing_answer') {
    return true;
  }
  if (mutation.type !== 'answer') {
    return false;
  }
  const interactionType = (mutation.payload as { interactionType?: unknown } | undefined)?.interactionType;
  return interactionType !== 'discrete';
}

export class PendingMutationDurabilityMirror {
  private pendingMutations: StudentAttemptMutation[] = [];
  private mutationVersion = 0;
  private durablePersistedMutationVersion = 0;
  private latestAnswerMutationVersion = 0;
  private persistChain: Promise<boolean> = Promise.resolve(true);
  private pendingWriteTimeout: number | null = null;
  private lastTrigger: DurablePersistTriggerSource = 'mutation';

  constructor(
    private readonly deps: {
      debounceMs: number;
      getAttempt: () => StudentAttempt | null;
      savePendingMutations: (attemptId: string, mutations: StudentAttemptMutation[]) => Promise<void>;
      clearPendingMutations: (attemptId: string) => Promise<void>;
      setStorageDurabilityBlocking: (active: boolean) => void;
      onPersistError: (
        error: unknown,
        pendingMutationCount: number,
        fallbackAttempt: StudentAttempt,
        source: DurablePersistTriggerSource,
        durablePersistResult?: 'failed' | 'checkpoint_failed',
      ) => void;
      onPendingMutationCountChange: (count: number) => void;
      onMutationVersionChange?: (version: number) => void;
      nowIso?: () => string;
    },
  ) {}

  reset(): void {
    this.pendingMutations = [];
    this.mutationVersion = 0;
    this.durablePersistedMutationVersion = 0;
    this.latestAnswerMutationVersion = 0;
    this.persistChain = Promise.resolve(true);
    this.lastTrigger = 'mutation';
    if (this.pendingWriteTimeout) {
      window.clearTimeout(this.pendingWriteTimeout);
      this.pendingWriteTimeout = null;
    }
    this.deps.onPendingMutationCountChange(0);
    this.deps.onMutationVersionChange?.(this.mutationVersion);
  }

  cancelDebouncedPersist(): void {
    this.clearDebounce();
  }

  getPendingMutations(): StudentAttemptMutation[] {
    return this.pendingMutations;
  }

  finalizeAfterSuccessfulClear(attemptId: string): void {
    this.cancelDebouncedPersist();
    this.pendingMutations = [];
    this.deps.onPendingMutationCountChange(0);
    this.mutationVersion += 1;
    this.durablePersistedMutationVersion = this.mutationVersion;
    this.latestAnswerMutationVersion = this.mutationVersion;
    this.deps.onMutationVersionChange?.(this.mutationVersion);
    void writeAnswerSyncCheckpoint(attemptId, this.mutationVersion, []);
    this.deps.setStorageDurabilityBlocking(false);
  }

  setPendingMutations(
    nextMutations: StudentAttemptMutation[],
    options?: {
      durableWriteMode?: PendingMutationDurableWriteMode;
      includesAnswerMutation?: boolean;
      awaitPersistence?: boolean;
      source?: DurablePersistTriggerSource;
    },
  ): Promise<boolean> | void {
    this.pendingMutations = nextMutations;
    this.deps.onPendingMutationCountChange(nextMutations.length);
    this.mutationVersion += 1;
    this.deps.onMutationVersionChange?.(this.mutationVersion);

    if (options?.includesAnswerMutation) {
      this.latestAnswerMutationVersion = this.mutationVersion;
    }

    const attempt = this.deps.getAttempt();
    if (attempt && options?.includesAnswerMutation) {
      const ok = writeAnswerSyncCheckpoint(attempt.id, this.mutationVersion, nextMutations);
      if (!ok) {
        this.deps.onPersistError(
          new Error('failed_to_write_sync_checkpoint'),
          nextMutations.length,
          attempt,
          options?.source ?? 'mutation',
          'checkpoint_failed',
        );
      }
    }

    if (options?.durableWriteMode === 'debounced') {
      this.scheduleDebouncedPersist();
      if (options?.awaitPersistence) {
        this.clearDebounce();
        return this.persistNow(options?.source ?? 'mutation');
      }
      return;
    }

    this.clearDebounce();
    const persistence = this.persistNow(options?.source ?? 'mutation');
    if (options?.awaitPersistence) {
      return persistence;
    }
    void persistence;
  }

  flushAnswerDurableMirrorNow(source: DurablePersistTriggerSource): void {
    if (this.durablePersistedMutationVersion >= this.latestAnswerMutationVersion) {
      return;
    }
    this.clearDebounce();
    void this.persistNow(source);
  }

  isDurableMirrorUpToDate(): boolean {
    return this.durablePersistedMutationVersion >= this.mutationVersion;
  }

  async persistNow(source: DurablePersistTriggerSource = 'mutation'): Promise<boolean> {
    this.lastTrigger = source;
    const persistTask = this.persistChain.then(async () => {
      const attempt = this.deps.getAttempt();
      if (!attempt) {
        return true;
      }

      const currentVersion = this.mutationVersion;
      if (currentVersion <= this.durablePersistedMutationVersion) {
        return true;
      }

      try {
        const pending = this.pendingMutations;
        if (pending.length > 0) {
          await this.deps.savePendingMutations(attempt.id, pending);
        } else {
          await this.deps.clearPendingMutations(attempt.id);
        }
      } catch (error) {
        this.deps.onPersistError(
          error,
          this.pendingMutations.length,
          attempt,
          this.lastTrigger,
          'failed',
        );
        return false;
      }

      this.durablePersistedMutationVersion = Math.max(
        this.durablePersistedMutationVersion,
        currentVersion,
      );
      this.deps.setStorageDurabilityBlocking(false);
      return true;
    });

    this.persistChain = persistTask;
    return persistTask;
  }

  hydratePendingMutations(args: {
    mutations: StudentAttemptMutation[];
    recoveredFromCheckpoint: boolean;
  }): void {
    // This matches the previous provider behavior:
    // - set RAM pending mutations
    // - if recovered from checkpoint, consider durable mirror stale and persist again
    // - else mark mirror as up-to-date
    const includesAnswerMutation = args.mutations.some(
      (mutation) => mutation.type === 'answer' || mutation.type === 'writing_answer',
    );
    this.pendingMutations = args.mutations;
    this.deps.onPendingMutationCountChange(args.mutations.length);
    this.mutationVersion += 1;
    this.deps.onMutationVersionChange?.(this.mutationVersion);
    if (includesAnswerMutation) {
      this.latestAnswerMutationVersion = this.mutationVersion;
    }

    if (args.recoveredFromCheckpoint && args.mutations.length > 0) {
      this.durablePersistedMutationVersion = Math.max(0, this.mutationVersion - 1);
      void this.persistNow('hydrate_checkpoint');
    } else {
      this.durablePersistedMutationVersion = this.mutationVersion;
    }
  }

  private clearDebounce(): void {
    if (this.pendingWriteTimeout) {
      window.clearTimeout(this.pendingWriteTimeout);
      this.pendingWriteTimeout = null;
    }
  }

  private scheduleDebouncedPersist(): void {
    this.clearDebounce();
    this.pendingWriteTimeout = window.setTimeout(() => {
      void this.persistNow('debounce_timer');
    }, this.deps.debounceMs);
  }
}

export function buildQueuedMutationUpdate(args: {
  currentAttempt: Pick<StudentAttempt, 'id' | 'scheduleId' | 'currentModule'>;
  pending: StudentAttemptMutation[];
  mutation: StudentAttemptMutation;
  patchSyncState?: AttemptSyncState | null | undefined;
  online: boolean;
  flushDelayMs: number;
}): {
  nextPendingMutations: StudentAttemptMutation[];
  includesAnswerMutation: boolean;
  durableWriteMode: PendingMutationDurableWriteMode;
  syncState: AttemptSyncState;
  flush: { kind: PendingMutationFlushKind; delayMs: number } | null;
} {
  const nextPendingMutations = coalescePendingMutations(args.pending, args.mutation);
  const mutationIsAnswer = isAnswerMutationType(args.mutation.type);

  return {
    nextPendingMutations,
    includesAnswerMutation: mutationIsAnswer,
    durableWriteMode:
      mutationIsAnswer && shouldDebounceAnswerDurability(args.mutation) ? 'debounced' : 'immediate',
    syncState: args.patchSyncState ?? (args.online ? 'saving' : 'offline'),
    flush:
      args.online
        ? {
            kind: args.mutation.type === 'writing_answer' ? 'writing' : 'objective',
            delayMs: args.flushDelayMs,
          }
        : null,
  };
}
