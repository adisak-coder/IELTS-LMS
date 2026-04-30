# Student Mutation Process (L7 View)

This document explains how student-side mutations move through the system, what correctness guarantees we rely on, and where operational risk sits.

## Scope

Flow covered:
1. UI state change + optimistic local update
2. Local queue + compaction policy
3. Flush orchestration and sequencing
4. API validation + auth/rate limits
5. Transactional apply + persistence
6. Conflict handling and replay

Primary code paths:
- `src/components/student/providers/StudentAttemptProvider.tsx`
- `src/services/studentAttemptRepository.ts`
- `backend/crates/api/src/routes/student.rs`
- `backend/crates/application/src/delivery.rs`

## End-to-End Flow

### 1) UI creates mutation and applies optimistic state

`StudentAttemptProvider.applyPatch(...)` builds a mutation object (`id`, `type`, `payload`, `timestamp`) and merges the patch into local attempt state immediately.

Key behavior:
- Adds `module` automatically for objective mutation types when missing (`answer`, `flag`, `writing_answer`)
- Coalesces superseded pending events by semantic key (`answer:<questionId>`, `writing_answer:<taskId>`, `flag:<questionId>`, `position`, etc.)
- Updates `recovery.lastLocalMutationAt`, `recovery.pendingMutationCount`, and `recovery.syncState`

References:
- `src/components/student/providers/StudentAttemptProvider.tsx:93`
- `src/components/student/providers/StudentAttemptProvider.tsx:120`
- `src/components/student/providers/StudentAttemptProvider.tsx:259`

### 2) Pending queue is persisted locally (offline-safe)

Pending mutations are saved to local storage. Queue size and byte limits are enforced with compaction to avoid unbounded growth.

Policy highlights:
- Max count: `1,000`
- Max serialized size: `512KB`
- Prefer dropping superseded compactable mutations before dropping protected/non-compactable ones

References:
- `src/services/studentAttemptRepository.ts:31`
- `src/services/studentAttemptRepository.ts:32`
- `src/services/studentAttemptRepository.ts:33`
- `src/services/studentAttemptRepository.ts:578`
- `src/services/studentAttemptRepository.ts:619`
- `src/services/studentAttemptRepository.ts:1198`

### 3) Flush scheduling and batching

Flush is triggered by timer and reconnect paths. Provider-level concurrency guard prevents overlapping flushes.

Mechanics:
- Objective mutations flush faster (400ms), writing flushes slower (1,500ms)
- `flushPending` short-circuits when offline or no queue
- Repository sends chunked batches of size `100`
- Sequence numbers are assigned client-side from watermark (`startSeq + index + 1`)

References:
- `src/components/student/providers/StudentAttemptProvider.tsx:246`
- `src/components/student/providers/StudentAttemptProvider.tsx:309`
- `src/services/studentAttemptRepository.ts:31`
- `src/services/studentAttemptRepository.ts:1356`
- `src/services/studentAttemptRepository.ts:1378`

### 4) API validates auth, limits, and payload shape

`POST /api/v1/student/sessions/:schedule_id/mutations:batch`:
- Parses `responseMode` (`full` or `ack`)
- Enforces per-attempt rate limit with burst allowance
- Confirms token claims match schedule
- Enforces `max_mutations_per_batch`
- Validates payload constraints (e.g., max writing length)

References:
- `backend/crates/api/src/routes/student.rs:329`
- `backend/crates/api/src/routes/student.rs:467`
- `backend/crates/api/src/routes/student.rs:349`
- `backend/crates/api/src/routes/student.rs:370`
- `backend/crates/api/src/routes/student.rs:378`

### 5) Delivery service applies batch transactionally

`DeliveryService.apply_mutation_batch(...)` runs in a DB transaction and locks the attempt row.

Correctness steps:
- Idempotency lookup (before and inside TX)
- `SELECT ... FOR UPDATE` on the attempt row
- Rejects submitted/cancelled sessions
- Computes gate (`ObjectiveLocked`, `SectionMismatch`, etc.) from runtime/proctor state
- Validates contiguous incoming sequence vs current accepted max
- Applies mutation by type to in-memory snapshot
- Persists:
  - optional mutation rows
  - updated attempt (answers/writing/flags/recovery/revision)
  - audit log
  - idempotent response

References:
- `backend/crates/application/src/delivery.rs:399`
- `backend/crates/application/src/delivery.rs:414`
- `backend/crates/application/src/delivery.rs:436`
- `backend/crates/application/src/delivery.rs:501`
- `backend/crates/application/src/delivery.rs:522`
- `backend/crates/application/src/delivery.rs:618`
- `backend/crates/application/src/delivery.rs:663`
- `backend/crates/application/src/delivery.rs:698`

### 6) Client reconciles response and advances watermark

On success:
- Update `serverAcceptedThroughSeq`
- Persist reduced remaining queue
- Save refreshed attempt token when provided
- Update in-memory and sessionStorage watermark for next sequence assignment

References:
- `src/services/studentAttemptRepository.ts:1389`
- `src/services/studentAttemptRepository.ts:1390`
- `src/services/studentAttemptRepository.ts:1398`
- `src/services/studentAttemptRepository.ts:1408`
- `src/services/studentAttemptRepository.ts:859`

## Mutation-Type Semantics

Server `apply_mutation(...)` rules:
- `answer`: objective gate required, section must match, value validated by schema
- `writing_answer`: objective gate required, current section must be `writing`, `taskId` must exist
- `flag`: objective gate required, section must match, boolean required
- `position`: telemetry only; validated and written to `recovery.clientPosition` (not authoritative phase/module)
- `violation`: merges snapshot by violation id, capped set
- unknown type: logged; not applied to answer state

References:
- `backend/crates/application/src/delivery.rs:2427`
- `backend/crates/application/src/delivery.rs:2536`
- `backend/crates/application/src/delivery.rs:2592`
- `backend/crates/application/src/delivery.rs:2610`

## Core Correctness Invariants

1. Per-attempt mutation sequence is contiguous.
- Enforced by `validate_contiguous_sequences(existing_max_seq, incoming)`.
- Prevents out-of-order or overlapping application.

2. Objective mutations only apply for the active live section.
- Runtime/proctor gate plus section membership checks.

3. Writes are atomic per batch.
- Attempt row lock + single transaction means no torn batch state.

4. Retry safety.
- Idempotency-key support at service layer plus sequence-based replay resistance.

5. Offline resilience with eventual convergence.
- Local queue + replay + watermark progression.

References:
- `backend/crates/application/src/delivery.rs:1725`
- `backend/crates/application/src/delivery.rs:1785`
- `backend/crates/application/src/delivery.rs:2649`
- `backend/crates/application/src/delivery.rs:436`
- `backend/crates/application/src/delivery.rs:414`

## Conflict and Recovery Paths

### Sequence mismatch (409)

Client treats this as likely “already accepted on server”, clears pending queue, clears local watermark, reloads fresh session, and re-primes watermark from server state.

References:
- `src/services/studentAttemptRepository.ts:1488`
- `src/services/studentAttemptRepository.ts:1493`
- `src/services/studentAttemptRepository.ts:1503`

### SECTION_MISMATCH / OBJECTIVE_LOCKED (409)

Client prunes stale objective mutations (based on module/runtime), logs an audit event `MUTATION_DROPPED_STALE_SECTION`, then retries flush with pruned queue.

References:
- `src/services/studentAttemptRepository.ts:1516`
- `src/services/studentAttemptRepository.ts:1530`
- `src/services/studentAttemptRepository.ts:1567`
- `src/services/studentAttemptRepository.ts:1584`

## L7 Assessment

What is strong:
- Good convergence model: optimistic UI + durable queue + server-authoritative sequence
- Real contention defense: row lock + contiguous sequence checks
- Practical field-grade conflict handling for section transitions
- Distinct “ack” mode reduces payload pressure during high-frequency flushing

Main risks:
- Watermark/state split across memory + sessionStorage + DB can drift during tab churn and partial failures.
- Local compaction under storage pressure can discard history aggressively (while preserving latest values), which is acceptable for state convergence but weak for forensic replay.
- Unknown mutation types are stored/logged but not applied; this can silently hide client/server schema skew unless monitored tightly.

## L7 Recommendations (Prioritized)

1. Add hard observability SLOs for mutation pipeline.
- Metrics: flush success rate, 409 rate by reason, median queue depth, watermark regressions, dropped-stale counts.
- Alert on abnormal `SECTION_MISMATCH`/`OBJECTIVE_LOCKED` spikes per schedule.

2. Introduce server-issued monotonic “apply token” in responses.
- Today we rely on `serverAcceptedThroughSeq`; include a stronger batch-commit token to detect split-brain between retry paths and local watermark drift.

3. Tighten unknown-mutation handling.
- Gate by allowlist with explicit versioning; emit high-priority telemetry when unknown types appear.

4. Add chaos tests for reconnect + tab duplication.
- Validate convergence across: duplicated tabs, network flaps, rapid section transitions, and token refresh races.

5. Decide and document retention strategy for mutation audit rows.
- `ack` mode intentionally avoids persisting high-volume objective rows; align this with compliance and incident investigation requirements.

## Related Artifact

A visual sequence diagram already exists:
- `docs/student-mutation-process.excalidraw`
