# Attempt Edge-Case Hardening TODO

## P0
- [ ] Add `POST /v1/student/sessions/:scheduleId/resume`.
- [ ] Define resume request contract:
  - [ ] `attemptId`
  - [ ] `clientSessionId`
  - [ ] `lastAckedSeq`
  - [ ] `localPendingMutationIds[]`
  - [ ] `localSnapshotHash`
- [ ] Define resume response contract:
  - [ ] `acceptedThroughSeq`
  - [ ] `serverRevision`
  - [ ] `serverSnapshotHash`
  - [ ] `instruction` in (`replay_pending`, `refresh_snapshot`, `already_submitted`, `session_superseded`)
  - [ ] optional `latestAttempt`
- [ ] Compute canonical server snapshot hash from persisted `answers/writingAnswers/flags`.
- [ ] Implement deterministic resume instruction selection.
- [ ] Update client reconnect flow to call resume first.
- [ ] Ensure reconnect never silently discards local dirty answers.

- [ ] Add terminal replay guard in client conflict handling.
- [ ] On `ATTEMPT_SUBMITTED` conflict:
  - [ ] purge pending mutation queue
  - [ ] clear mutation watermark
  - [ ] set terminal sync state
- [ ] On `ATTEMPT_EXPIRED` conflict:
  - [ ] purge pending mutation queue
  - [ ] clear mutation watermark
  - [ ] set terminal sync state
- [ ] Keep retry path only for recoverable conflicts:
  - [ ] `BASE_REVISION_MISMATCH`
  - [ ] section prune conflicts (`SECTION_MISMATCH` / `OBJECTIVE_LOCKED` as applicable)
- [ ] Add metric and audit event for dropped post-terminal replay attempts.

- [ ] Add table `student_attempt_finalizations`.
- [ ] Table schema:
  - [ ] `attempt_id` primary key / unique
  - [ ] `submission_id`
  - [ ] `source` enum (`student_submit`, `auto_submit`)
  - [ ] `reason`
  - [ ] `finalized_at`
  - [ ] `snapshot_hash`
- [ ] Write finalization row in `submit_attempt` transaction.
- [ ] Write finalization row in `finalize_pending_schedule_attempts` transaction.
- [ ] If finalization row exists, return deterministic already-finalized response.
- [ ] Prevent any rewrite of frozen final snapshot.

- [ ] Add config `FINAL_SUBMIT_GRACE_SECONDS` (default `15`).
- [ ] Keep mutation-after-deadline rejection behavior.
- [ ] Accept `submit + finalAnswerPatch` only when arrival <= deadline + grace.
- [ ] After grace:
  - [ ] finalize from canonical persisted state
  - [ ] do not apply client final patch
  - [ ] set source=`auto_submit`, reason=`deadline_grace_expired`
- [ ] Persist `graceOutcome` in submit audit payload.

- [ ] Introduce `AttemptCommandWriter` as single owner for protected attempt writes.
- [ ] Move all writes for protected columns behind writer:
  - [ ] `answers`
  - [ ] `writing_answers`
  - [ ] `flags`
  - [ ] `final_submission`
  - [ ] `submitted_at`
  - [ ] `revision`
- [ ] Refactor mutation apply path to use writer.
- [ ] Refactor `submit_attempt` to use writer.
- [ ] Refactor auto-submit finalizer to use writer.
- [ ] Add DB guard trigger for protected columns.
- [ ] Require connection-scoped writer flag for protected updates.
- [ ] Ensure direct SQL updates fail without writer flag.

## P1
- [ ] Align version freeze for student payloads:
  - [ ] resolve content by attempt `published_version_id` when attempt exists
  - [ ] avoid relying only on schedule current published version for active attempt data
- [ ] Include `attemptPublishedVersionId` in live payload.
- [ ] Ensure grading/export always uses attempt-frozen version keys.

- [ ] Keep LiveBus as notification-only channel.
- [ ] Emit non-zero revisions where concrete row/runtime revision is known.
- [ ] Force refetch on critical events (`submit`, `auto-finalize`).
- [ ] Ignore stale live events by revision.

- [ ] Add client request arbitration priority:
  - [ ] `submit` highest
  - [ ] mutation flush medium
  - [ ] heartbeat low
  - [ ] telemetry lowest
- [ ] Defer heartbeat best-effort while submit is in flight.
- [ ] Add observability for submit latency during reconnect storms.

- [ ] Add shared backend answer formatter for grading/export fidelity.
- [ ] Ensure grading UI and export derive from same canonical raw representation.
- [ ] Remove ad-hoc transformations that can alter fidelity (trim/join/reorder).

- [ ] Persist forensic checkpoints per attempt:
  - [ ] submit request hash
  - [ ] final patch hash
  - [ ] canonical final snapshot hash
  - [ ] accepted seq
  - [ ] finalization source/reason
- [ ] Add/extend metrics:
  - [ ] `backend_submit_missing_seq_total`
  - [ ] `backend_submit_final_patch_applied_total`
  - [ ] `backend_final_snapshot_hash_mismatch_total`
  - [ ] `idempotency_payload_mismatch_total`
  - [ ] `client_dom_state_vs_payload_mismatch_total`

## Tests
- [ ] Integration: reconnect with local dirty + server stale/newer => deterministic resume instruction, no silent local loss.
- [ ] Integration: submit success followed by delayed mutation replay => final snapshot unchanged, queue purged.
- [ ] Integration: simultaneous student submit vs auto-finalize => exactly one finalization row and one immutable final snapshot.
- [ ] Integration: deadline boundary (`-1s`, `+10s`, `+16s`) => patch accepted only within 15s grace.
- [ ] DB guard test: direct protected-column update without writer flag fails.
- [ ] Contract tests: resume schema and conflict reason behavior.
- [ ] Client tests: terminal conflict purge and priority arbitration under submit + heartbeat + mutation concurrency.

## Defaults
- [ ] Grace window = 15 seconds.
- [ ] Reconnect resolution = replay-local-first for same active session.
- [ ] Enforcement = code + DB guard.
- [ ] Repeated submit with same idempotency key remains idempotent.
