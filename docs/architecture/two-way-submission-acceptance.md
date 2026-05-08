# Two-Way Submission Acceptance (Accept-First + Reconcile)

## Purpose

Define a submission architecture that prioritizes **answer durability** over immediate strict validation so student answers are not lost when:

- question IDs drift,
- slot indexes mismatch,
- exam blocks are malformed or partially migrated,
- sub-answer tree keys differ between frontend/backend.

This design targets practical "100% acceptance semantics":

1. Always durably accept student submission payloads (except auth/rate-limit/invalid JSON envelope).
2. Normalize/map answers best-effort for grading.
3. Keep unmapped answers visible and recoverable.

## Problem Statement

Current behavior couples "accept submission" and "all answer keys must map now".  
If mapping logic fails at submit time, answers can be rejected or effectively hidden from grading.

## Design Summary

Use **two paths** for every submit:

1. **Primary path (online normalization)**  
   Map incoming answers to canonical keys and proceed with grading projection.

2. **Safety path (immutable ingest ledger)**  
   Persist raw submit payload first, always, as append-only event history.

If mapping is incomplete:

- submission remains accepted,
- unresolved entries go to an orphan queue,
- background replay and manual repair can resolve later.

## Goals

- Never silently drop student answers.
- Keep submission API success independent from content-key mismatches.
- Preserve idempotency guarantees.
- Make grading state explicit when mapping is partial.
- Enable deterministic replay after mapping logic fixes.

## Non-Goals

- Perfect automatic grading for every malformed payload.
- Replacing existing mutation outbox/durability logic.
- Changing auth/rate-limit/security policy.

## Architecture

### Submit lifecycle

1. Validate envelope: auth, attempt ownership, idempotency key, basic payload shape.
2. Write raw event to `submission_ingest_events` (immutable).
3. Finalize attempt (submitted/post-exam) and return accepted response.
4. Normalize answers against attempt-scoped manifest.
5. Store mapped answers + unresolved answers separately.
6. Grade mapped answers immediately; mark submission as partial when unresolved > 0.

### Why this works

- If mapping logic is wrong today, raw payload survives.
- After code fix, replay worker can rebuild normalized/grading projection.
- Manual repair is possible for edge cases replay cannot infer.

## Data Model

### 1) Raw ingest ledger

`submission_ingest_events`

- `id` (uuid)
- `attempt_id`
- `schedule_id`
- `submission_id`
- `idempotency_key`
- `payload_json` (full raw submit payload)
- `payload_hash` (canonical hash)
- `accepted_at`

Constraints:

- unique `(attempt_id, submission_id)`
- index `(attempt_id, accepted_at)`

### 2) Attempt answer manifest (frozen at attempt start)

`attempt_answer_manifest`

- `id` (uuid)
- `attempt_id`
- `manifest_version`
- `manifest_json`
- `created_at`

Manifest JSON contains:

- canonical `stable_answer_id`
- aliases (`legacy_question_id`, `slot_id`, optional index aliases)
- section ownership
- expected shape (`scalar`, `array`, `enum`, etc.)

### 3) Normalized answers (projection)

`normalized_answers`

- `id` (uuid)
- `ingest_event_id`
- `attempt_id`
- `stable_answer_id`
- `section_key`
- `value_json`
- `mapped_by` (`exact_id|slot_alias|legacy_index|heuristic`)
- `created_at`

### 4) Unmapped answers (orphan queue)

`submission_answer_orphans`

- `id` (uuid)
- `ingest_event_id`
- `attempt_id`
- `raw_key`
- `raw_value_json`
- `reason` (`unknown_id|slot_mismatch|invalid_shape|manifest_missing`)
- `created_at`
- `resolved_at` (nullable)
- `resolution_note` (nullable)

## API Contract

### `POST /v1/student/sessions/:schedule_id/submit`

### Reject only for

- authentication/authorization failure
- attempt ownership mismatch
- idempotency conflict
- rate limit
- invalid outer JSON envelope

### Do not reject for

- unknown question IDs
- slot index mismatch
- unsupported block key shapes
- partial manifest mismatch

### Response extension

Add acceptance metadata:

```json
{
  "attempt": {},
  "submissionId": "student-submit-...",
  "submittedAt": "2026-05-08T12:34:56Z",
  "acceptance": {
    "accepted": true,
    "ingestId": "uuid",
    "normalizationStatus": "pending|complete|partial",
    "unmappedCount": 2
  }
}
```

## Mapping Strategy (ordered)

1. Exact canonical key match.
2. Stable slot alias match (`block:slot`).
3. Legacy key + index alias.
4. Safe heuristic (only deterministic, audited transforms).
5. Else orphan.

Rules:

- Mapping is deterministic and versioned.
- Never overwrite raw payload.
- Never coerce unknown data into a guessed key without traceability.

## Grading Behavior

- Grade from `normalized_answers` only.
- If orphans exist:
  - keep submission accepted,
  - set review flag (e.g. `answer_mapping_incomplete`),
  - expose orphan entries in grader/admin UI.

## Replay + Repair

### Replay worker

- Input: `submission_ingest_events`
- Re-run mapping with latest mapper version.
- Upsert `normalized_answers`.
- Close orphans when resolved.
- Recompute grading projections for affected submissions.

### Manual repair

- Admin/grader can bind orphan key -> canonical key.
- Repair action recorded with actor + timestamp + reason.
- Repair triggers projection rebuild.

## Idempotency

- Existing idempotency key semantics remain authoritative.
- Same `(attempt_id, submission_id/idempotency_key)` returns same accepted result.
- Raw ingest write must be idempotent-safe (upsert/no duplicate side effects).

## Failure Modes and Outcomes

1. Mapper crash after ingest write  
   - Submit still accepted.
   - Event remains pending for replay.

2. DB fail after ingest write before attempt finalize  
   - Transaction strategy must ensure consistent recovery.
   - Replay can re-drive finalize if needed (feature-flagged path).

3. Manifest missing/corrupt  
   - Orphan all answer keys with `manifest_missing`.
   - Submission still accepted.

4. Grading service unavailable  
   - Keep normalized/orphan data.
   - Async grading retry later.

## Observability

Metrics:

- `submit_accepted_total`
- `submit_rejected_total` (by reason)
- `submit_orphan_answers_total`
- `submit_orphan_rate`
- `submit_replay_recovered_total`
- `submit_manual_repairs_total`
- `submit_time_to_full_mapping_seconds`

Alerts:

- orphan rate above threshold
- replay backlog age above threshold
- ingest write failures > 0

## Security and Compliance

- Raw payloads may include PII; apply existing retention and access controls.
- Restrict orphan inspection/repair to authorized staff roles.
- Keep audit trail for replay and manual repair actions.

## Rollout Plan

### Phase 1 (safe foundation)

- Add ingest ledger table.
- Write ingest event on every submit.
- Keep existing normalize+grade path.

### Phase 2 (fail-open content)

- Remove content-key hard reject at submit.
- Introduce orphan persistence.
- Return acceptance metadata.

### Phase 3 (replay)

- Add replay worker and backfill command.
- Add mapper version tagging.

### Phase 4 (manual repair UI)

- Build orphan inspection + bind tool.
- Trigger projection regrade on repair.

### Phase 5 (SLO hardening)

- Metrics/alerts dashboards.
- Runbooks for spikes and replay backlog.

## Backward Compatibility

- Existing clients can ignore `acceptance` field.
- Existing submit payload format remains valid.
- Feature flag can gate fail-open behavior per environment.
