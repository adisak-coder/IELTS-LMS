# Student Mutation Outbox (Architecture Note)

## Purpose

The student app persists answer changes as an **append-only mutation queue** that is:

- coalesced locally (latest write wins per logical key),
- written durably (local mirror + checkpoint),
- flushed to the backend in batches (`mutations:batch`) when online,
- and reflected back into the UI via `syncState` + `pendingMutationCount`.

The goal of the **Student Mutation Outbox module** is to concentrate these rules behind one interface
to improve locality (one place to change) and leverage (callers stay simple).

## Current flow (high-level)

1. UI typing calls `persistAnswer` / `persistWritingAnswer`.
2. `StudentAttemptProvider` creates a `StudentAttemptMutation`, updates pending queue, and schedules a flush.
3. `studentAttemptRepository.saveAttempt(...)` flushes pending mutations to `POST /v1/student/sessions/:scheduleId/mutations:batch`.
4. Backend applies mutations and persists:
   - `student_attempt_mutations` (mutation log)
   - `student_attempts` (authoritative snapshot: answers/writing_answers/flags + revision)

## Extracted outbox helpers

Current extractions in the outbox module:

- `src/services/studentMutationOutbox.ts`
  - `coalescePendingMutations(...)`
  - `buildQueuedMutationUpdate(...)` (enqueue decision: coalesce + durability mode + flush kind)
  - `PendingMutationDurabilityMirror` (durable mirror + checkpoint + debounce)
  - `createStudentMutationOutbox(...).flushNow()` (network flush state machine)

Next step is to keep shrinking `StudentAttemptProvider` toward lifecycle wiring only (events/timers + passing runtime dimensions).
