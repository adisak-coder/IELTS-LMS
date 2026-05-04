# Submit Final Save + Finalize Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate student-visible submit race failures by making submit carry final answer state and finalize atomically in one server transaction.

**Architecture:** Extend submit contract (`finalAnswerPatch`, sequence metadata, hash), then execute `apply final patch + finalize` under attempt row lock in `DeliveryService.submit_attempt`. Keep current safety rails (attempt token binding, idempotency hash checks, active-session fencing) and add deterministic submit conflict reasons.

**Tech Stack:** Rust (`axum`, `sqlx`), TypeScript/React, MySQL migrations, cargo tests, vitest.

---

## Scope

In scope:
- Student submit API contract changes.
- Backend submit transaction semantics (`final save + finalize`).
- Frontend submit payload construction from latest client-visible state.
- Deterministic conflict/error responses for submit.
- Regression tests for mutation/submit race.

Out of scope (follow-up plan):
- Full `attempt_commands` event-store refactor for all write paths.
- Multi-tab collaborative merge model.

## Task 1: Lock Regression Baseline (Red Tests First)

**Files:**
- Modify: `backend/tests/contracts/student_contract.rs`
- Modify: `backend/tests/integration/mutation_replay.rs`
- Modify: `src/services/__tests__/studentAttemptRepository.backend.test.ts`

- [x] **Step 1: Add failing backend contract test for submit with in-flight-equivalent final patch**

```rust
#[tokio::test]
async fn submit_applies_final_patch_even_if_last_seen_revision_is_behind() {
    // Arrange attempt + one saved mutation.
    // Act submit with stale lastSeenRevision but with final patch payload.
    // Assert 200 OK and final_submission contains patched value.
}
```

- [x] **Step 2: Add failing backend test for missing sequence without final patch**

```rust
#[tokio::test]
async fn submit_rejects_missing_seq_without_final_patch() {
    // Assert conflict reason FINAL_FLUSH_REQUIRED.
}
```

- [x] **Step 3: Add failing frontend repository test for submit payload shape**

```ts
it('builds submit payload with finalAnswerPatch and sequence metadata', async () => {
  // expect backendPost payload to include:
  // clientFinalSeq, serverAcceptedThroughSeq, finalAnswerPatch, finalClientSnapshotHash
});
```

- [ ] **Step 4: Run targeted red tests**

Run:
```bash
cd backend && cargo test submit_applies_final_patch_even_if_last_seen_revision_is_behind -- --nocapture
cd backend && cargo test submit_rejects_missing_seq_without_final_patch -- --nocapture
npm run test -- src/services/__tests__/studentAttemptRepository.backend.test.ts
```

Expected: failing assertions referencing missing submit fields/behavior.

- [ ] **Step 5: Commit**

```bash
git add backend/tests/contracts/student_contract.rs backend/tests/integration/mutation_replay.rs src/services/__tests__/studentAttemptRepository.backend.test.ts
git commit -m "test: add red regression coverage for submit final-save semantics"
```

## Task 2: Extend Submit Domain + API Contract

**Files:**
- Modify: `backend/crates/domain/src/attempt.rs`
- Modify: `backend/crates/api/src/routes/student.rs`
- Modify: `src/services/studentAttemptRepository.ts`
- Modify: `src/types/studentAttempt.ts`

- [x] **Step 1: Add new submit fields in backend domain model**

```rust
pub struct StudentSubmitRequest {
    pub attempt_id: String,
    pub student_key: String,
    pub last_seen_revision: Option<i32>,
    pub submission_id: Option<String>,
    pub client_session_id: Option<String>,
    pub client_final_seq: Option<i64>,
    pub server_accepted_through_seq: Option<i64>,
    pub final_answer_patch: Option<Value>,
    pub final_client_snapshot_hash: Option<String>,
    pub answers: Option<Value>,
    pub writing_answers: Option<Value>,
    pub flags: Option<Value>,
}
```

- [x] **Step 2: Accept new JSON fields in API submit request parser**

```rust
#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ApiSubmitRequest {
    attempt_id: String,
    last_seen_revision: i32,
    submission_id: String,
    client_final_seq: Option<i64>,
    server_accepted_through_seq: Option<i64>,
    final_answer_patch: Option<Value>,
    final_client_snapshot_hash: Option<String>,
}
```

- [x] **Step 3: Thread fields through `submit_student_session` to `StudentSubmitRequest`**

```rust
let req = StudentSubmitRequest {
    attempt_id: attempt_id.clone(),
    student_key: load_attempt_student_key(&state, &attempt_id).await?,
    last_seen_revision: Some(api_req.last_seen_revision),
    submission_id: Some(api_req.submission_id),
    client_session_id: Some(claims_client_session_id),
    client_final_seq: api_req.client_final_seq,
    server_accepted_through_seq: api_req.server_accepted_through_seq,
    final_answer_patch: api_req.final_answer_patch,
    final_client_snapshot_hash: api_req.final_client_snapshot_hash,
    answers: None,
    writing_answers: None,
    flags: None,
};
```

- [x] **Step 4: Update frontend request types (no behavior yet)**

```ts
interface BackendSubmitRequest {
  attemptId: string;
  lastSeenRevision: number;
  submissionId: string;
  clientFinalSeq?: number;
  serverAcceptedThroughSeq?: number;
  finalAnswerPatch?: {
    answers: StudentAttempt['answers'];
    writingAnswers: StudentAttempt['writingAnswers'];
    flags: StudentAttempt['flags'];
  };
  finalClientSnapshotHash?: string;
}
```

- [x] **Step 5: Run compile checks**

Run:
```bash
cd backend && cargo test submit_finalizes_the_attempt_idempotently -- --nocapture
npm run test -- src/services/__tests__/studentAttemptRepository.backend.test.ts
```

Expected: compile green, behavior tests still failing.

- [ ] **Step 6: Commit**

```bash
git add backend/crates/domain/src/attempt.rs backend/crates/api/src/routes/student.rs src/services/studentAttemptRepository.ts src/types/studentAttempt.ts
git commit -m "feat: extend submit contract with final patch and sequence metadata"
```

## Task 3: Frontend Submit Payload = What Student Sees Now

**Files:**
- Modify: `src/services/studentAttemptRepository.ts`
- Modify: `src/components/student/providers/StudentAttemptProvider.tsx`
- Modify: `src/components/student/StudentApp.tsx`
- Modify: `src/components/student/StudentWriting.tsx`

- [x] **Step 1: Build submit final patch from latest local authoritative state**

```ts
function buildFinalAnswerPatch(attempt: StudentAttempt) {
  return {
    answers: attempt.answers,
    writingAnswers: attempt.writingAnswers,
    flags: attempt.flags,
  };
}
```

- [x] **Step 2: Add client hash helper over final patch**

```ts
async function sha256Hex(value: unknown): Promise<string> {
  const encoded = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
```

- [x] **Step 3: Send new submit fields from repository**

```ts
const finalAnswerPatch = buildFinalAnswerPatch(attempt);
const finalClientSnapshotHash = await sha256Hex(finalAnswerPatch);
const response = await this.postWithAttemptAuth<BackendSubmitResponse>(attempt, submitUrl, {
  attemptId: attempt.id,
  lastSeenRevision: Number(attempt.revision ?? 0),
  submissionId,
  clientFinalSeq: readOrPrimeMutationSequenceWatermark(attempt.id, clientSessionId),
  serverAcceptedThroughSeq: attempt.recovery.serverAcceptedThroughSeq ?? 0,
  finalAnswerPatch,
  finalClientSnapshotHash,
}, ...);
```

- [x] **Step 4: Ensure submit path always commits latest writing draft before repository submit**

```ts
writingDraftCommitRef.current?.();
const submitted = await attemptActions.submitAttempt();
```

Note: keep existing behavior, but add/adjust test assertions for this invariant.

- [x] **Step 5: Run targeted frontend tests**

Run:
```bash
npm run test -- src/components/student/providers/__tests__/StudentAttemptProvider.test.tsx
npm run test -- src/components/student/__tests__/StudentWriting.lifecycle.test.tsx
npm run test -- src/services/__tests__/studentAttemptRepository.backend.test.ts
```

Expected: payload and pre-submit commit coverage green.

- [ ] **Step 6: Commit**

```bash
git add src/services/studentAttemptRepository.ts src/components/student/providers/StudentAttemptProvider.tsx src/components/student/StudentApp.tsx src/components/student/StudentWriting.tsx
git commit -m "feat: send final-answer patch and snapshot hash on submit"
```

## Task 4: Backend Submit Transaction = Apply Final Patch + Finalize

**Files:**
- Modify: `backend/crates/application/src/delivery.rs`
- Modify: `backend/tests/contracts/student_contract.rs`
- Modify: `backend/tests/integration/submission_unanswered_policy.rs`

- [x] **Step 1: Add final patch validator/applicator**

```rust
fn apply_submit_final_patch(
    attempt: &StudentAttempt,
    final_answer_patch: Option<&Value>,
    answer_schema: &AnswerSchema,
    writing_task_ids: &HashSet<String>,
) -> Result<(Value, Value, Value), DeliveryError> {
    // If patch present: validate schema/shape, then return patched answers/writing/flags.
    // If absent: return server current state.
}
```

- [x] **Step 2: Replace submit stale gate with deterministic policy**

```rust
if last_seen_revision != attempt.revision {
    if req.final_answer_patch.is_none() {
        return Err(DeliveryError::conflict_with_context(
            DeliveryConflictReason::BaseRevisionMismatch,
            "Submit requires final flush payload when revision is stale.",
            Some(attempt.revision),
            ...,
        ));
    }
}
```

- [x] **Step 3: Apply final patch before building `final_submission`**

```rust
let (final_answers, final_writing_answers, final_flags) =
    apply_submit_final_patch(&attempt, req.final_answer_patch.as_ref(), &answer_schema, &writing_task_ids)?;

let final_submission = json!({
    "submissionId": submission_id,
    "submittedAt": now,
    "answers": final_answers,
    "writingAnswers": final_writing_answers,
    "flags": final_flags,
    "clientFinalSeq": req.client_final_seq,
    "serverAcceptedThroughSeq": req.server_accepted_through_seq,
    "finalClientSnapshotHash": req.final_client_snapshot_hash
});
```

- [x] **Step 4: Keep idempotent replay + submitted finality unchanged**

```rust
if let Some(submitted_at) = attempt.submitted_at {
    let response = build_submit_response(attempt, submitted_at);
    // store/replay idempotent response exactly as current behavior
}
```

- [ ] **Step 5: Run targeted backend tests**

Run:
```bash
cd backend && cargo test submit_finalizes_the_attempt_idempotently -- --nocapture
cd backend && cargo test submit_replays_cached_response_for_the_same_idempotency_key -- --nocapture
cd backend && cargo test submit_applies_final_patch_even_if_last_seen_revision_is_behind -- --nocapture
cd backend && cargo test submit_rejects_missing_seq_without_final_patch -- --nocapture
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add backend/crates/application/src/delivery.rs backend/tests/contracts/student_contract.rs backend/tests/integration/submission_unanswered_policy.rs
git commit -m "feat: make submit apply final patch and finalize atomically"
```

## Task 5: Deterministic Submit Conflict Reasons + API Mapping

**Files:**
- Modify: `backend/crates/application/src/delivery.rs`
- Modify: `backend/crates/api/src/routes/student.rs`
- Modify: `src/services/studentAttemptRepository.ts`

- [x] **Step 1: Add new conflict reasons**

```rust
pub enum DeliveryConflictReason {
    // existing...
    FinalFlushRequired,
    FinalPayloadHashMismatch,
}
```

- [x] **Step 2: Return explicit reason/details**

```rust
return Err(DeliveryError::conflict_with_context(
    DeliveryConflictReason::FinalFlushRequired,
    "Submit rejected: final answer patch is required for stale revision.",
    Some(attempt.revision),
    ...,
));
```

- [x] **Step 3: Update frontend conflict handling for submit retry UX**

```ts
if (reason === 'FINAL_FLUSH_REQUIRED') {
  // force one immediate flush + rebuild submit payload, then retry once
}
```

- [ ] **Step 4: Run contract and frontend tests**

Run:
```bash
cd backend && cargo test submit_attempt_blocks_unanswered_only_while_runtime_live_or_paused -- --nocapture
npm run test -- src/services/__tests__/studentAttemptRepository.backend.test.ts
```

Expected: reason mapping and retry path green.

- [ ] **Step 5: Commit**

```bash
git add backend/crates/application/src/delivery.rs backend/crates/api/src/routes/student.rs src/services/studentAttemptRepository.ts
git commit -m "feat: add deterministic submit conflict reasons and client handling"
```

## Task 6: Observability for Submit Invariant

**Files:**
- Modify: `backend/crates/infrastructure/src/telemetry.rs`
- Modify: `backend/crates/api/src/routes/student.rs`
- Modify: `src/utils/studentObservability.ts`

- [x] **Step 1: Add backend metrics for submit final-save invariants**

```rust
// examples
observe_counter("submit_final_patch_applied_total", 1, labels);
observe_counter("submit_missing_seq_total", 1, labels);
observe_counter("final_snapshot_hash_mismatch_total", 1, labels);
```

- [x] **Step 2: Emit metrics in submit path**

```rust
state.telemetry.observe_answer_commit("submit", duration);
// plus new counters around patch and conflict branches
```

- [x] **Step 3: Add client metric on submit payload hash creation / retry branch**

```ts
emitStudentObservabilityMetric('student_submit_final_patch_built_total', {...});
```

- [ ] **Step 4: Run verification tests**

Run:
```bash
cd backend && cargo test submit_finalizes_the_attempt_idempotently -- --nocapture
npm run test -- src/services/__tests__/studentAttemptRepository.backend.test.ts
```

Expected: no regressions.

- [ ] **Step 5: Commit**

```bash
git add backend/crates/infrastructure/src/telemetry.rs backend/crates/api/src/routes/student.rs src/utils/studentObservability.ts
git commit -m "chore: instrument submit final-save invariants"
```

## Task 7: Optional P1 Attempt State Expansion (`submitting`)

**Files:**
- Modify: `backend/migrations/0006_delivery.sql`
- Add: `backend/migrations/0021_attempt_submitting_state.sql`
- Modify: `backend/crates/application/src/delivery.rs`
- Modify: `backend/crates/domain/src/attempt.rs`

- [ ] **Step 1: Introduce migration adding `submitting` to phase/state checks**

```sql
-- migration snippet
-- expand phase constraint to include 'submitting'
```

- [ ] **Step 2: Set phase transition `exam -> submitting -> post-exam` inside submit transaction**

```rust
// update phase to submitting before final snapshot work, then post-exam on commit path
```

- [ ] **Step 3: Add regression test for illegal reverse transition**

```rust
#[tokio::test]
async fn submitted_attempt_cannot_transition_back_to_exam() { /* ... */ }
```

- [ ] **Step 4: Run migration + focused tests**

Run:
```bash
cd backend && cargo test submit_finalizes_the_attempt_idempotently -- --nocapture
cd backend && cargo test exam_lifecycle -- --nocapture
```

Expected: migration + lifecycle tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/migrations/0006_delivery.sql backend/migrations/0021_attempt_submitting_state.sql backend/crates/application/src/delivery.rs backend/crates/domain/src/attempt.rs
git commit -m "feat: add submitting transition state for attempt finalization"
```

## Task 8: Full Verification + Release Notes

**Files:**
- Modify: `docs/student-mutation-process-l7.md`
- Modify: `docs/superpowers/specs/2026-05-01-student-happy-path-design.md`

- [ ] **Step 1: Run full backend student delivery suite**

Run:
```bash
cd backend && cargo test student_contract -- --nocapture
cd backend && cargo test mutation_replay -- --nocapture
cd backend && cargo test submission_unanswered_policy -- --nocapture
```

Expected: all green.

- [ ] **Step 2: Run full affected frontend suite**

Run:
```bash
npm run test -- src/components/student/providers/__tests__/StudentAttemptProvider.test.tsx
npm run test -- src/components/student/__tests__/StudentApp.test.tsx
npm run test -- src/services/__tests__/studentAttemptRepository.backend.test.ts
```

Expected: all green.

- [ ] **Step 3: Update docs to reflect new submit invariants**

```md
New invariant:
The submitted answer equals the client final patch captured at submit time, validated and frozen in one transaction.
```

- [ ] **Step 4: Commit**

```bash
git add docs/student-mutation-process-l7.md docs/superpowers/specs/2026-05-01-student-happy-path-design.md
git commit -m "docs: document submit final-save invariant and conflict model"
```

---

## Commit Order Summary

1. `test: add red regression coverage for submit final-save semantics`
2. `feat: extend submit contract with final patch and sequence metadata`
3. `feat: send final-answer patch and snapshot hash on submit`
4. `feat: make submit apply final patch and finalize atomically`
5. `feat: add deterministic submit conflict reasons and client handling`
6. `chore: instrument submit final-save invariants`
7. `feat: add submitting transition state for attempt finalization` (optional P1)
8. `docs: document submit final-save invariant and conflict model`

## Verification Gate Before Merge

- Backend:
```bash
cd backend && cargo test student_contract mutation_replay submission_unanswered_policy -- --nocapture
```
- Frontend:
```bash
npm run test -- src/services/__tests__/studentAttemptRepository.backend.test.ts src/components/student/providers/__tests__/StudentAttemptProvider.test.tsx src/components/student/__tests__/StudentApp.test.tsx
```

If any fail, block merge and fix in the same task branch before PR.
