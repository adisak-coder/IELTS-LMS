export type FreshnessDimension = {
  revision: number | null;
  updatedAtMs: number | null;
};

export type LiveSnapshotFreshness = {
  attempt: FreshnessDimension;
  runtime: FreshnessDimension;
};

export type LiveSnapshotFreshnessMergeMode = {
  applyAttempt: boolean;
  applyRuntime: boolean;
};

function parseFiniteNumber(value: unknown): number | null {
  if (typeof value !== 'number') {
    return null;
  }
  return Number.isFinite(value) ? value : null;
}

function parseIsoTimestampMs(value: unknown): number | null {
  if (typeof value !== 'string') {
    return null;
  }
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

// Returns -1 if incoming is older, 0 if equal/unknown, 1 if newer.
// Rule: revisioned snapshots always outrank revisionless snapshots.
export function compareFreshnessDimension(incoming: FreshnessDimension, applied: FreshnessDimension): number {
  const incomingRevision = incoming.revision;
  const appliedRevision = applied.revision;

  const incomingHasRevision = typeof incomingRevision === 'number' && Number.isFinite(incomingRevision);
  const appliedHasRevision = typeof appliedRevision === 'number' && Number.isFinite(appliedRevision);

  if (incomingHasRevision && appliedHasRevision) {
    if (incomingRevision > appliedRevision) return 1;
    if (incomingRevision < appliedRevision) return -1;
    return 0;
  }

  if (incomingHasRevision && !appliedHasRevision) return 1;
  if (!incomingHasRevision && appliedHasRevision) return -1;

  const incomingTs = incoming.updatedAtMs;
  const appliedTs = applied.updatedAtMs;
  const incomingHasTs = typeof incomingTs === 'number' && Number.isFinite(incomingTs);
  const appliedHasTs = typeof appliedTs === 'number' && Number.isFinite(appliedTs);

  if (incomingHasTs && appliedHasTs) {
    if (incomingTs > appliedTs) return 1;
    if (incomingTs < appliedTs) return -1;
  }

  return 0;
}

export function mergeLiveSnapshotFreshness(
  previous: LiveSnapshotFreshness | null,
  incoming: LiveSnapshotFreshness,
  mode: LiveSnapshotFreshnessMergeMode,
): LiveSnapshotFreshness {
  if (!previous) {
    return {
      attempt: mode.applyAttempt ? incoming.attempt : { revision: null, updatedAtMs: null },
      runtime: mode.applyRuntime ? incoming.runtime : { revision: null, updatedAtMs: null },
    };
  }

  return {
    attempt: mode.applyAttempt ? incoming.attempt : previous.attempt,
    runtime: mode.applyRuntime ? incoming.runtime : previous.runtime,
  };
}

export function extractLiveSnapshotFreshness(live: unknown): LiveSnapshotFreshness {
  const record = asRecord(live) ?? {};
  const attempt = asRecord(record['attempt']);
  const runtime = asRecord(record['runtime']);

  return {
    attempt: {
      revision: parseFiniteNumber(attempt?.['revision']),
      updatedAtMs: parseIsoTimestampMs(attempt?.['updatedAt']),
    },
    runtime: {
      revision: parseFiniteNumber(runtime?.['revision']),
      updatedAtMs: parseIsoTimestampMs(runtime?.['updatedAt']),
    },
  };
}

