# Student Session Route State Machine Design

Date: 2026-05-07
Status: Proposed
Scope: Refactor `useStudentSessionRouteData` internals into a state-machine architecture while keeping its public API unchanged.

## Goals

- Keep external hook contract stable:
  - `useStudentSessionRouteData(scheduleId, studentId)`
  - same returned shape and behavior semantics.
- Reduce coupling in `useStudentSessionRouteData` by moving transition logic into a deterministic reducer/state-machine.
- Preserve existing freshness arbitration behavior and observability semantics.
- Improve testability by isolating:
  - transition logic,
  - side-effect orchestration,
  - hook integration.

## Non-Goals

- No route/component API changes.
- No backend contract changes.
- No semantic changes to rollout flags, stale discard policy, or auth behavior.

## Current Pain Points

- One hook currently owns:
  - static + live fetch orchestration,
  - freshness arbitration,
  - websocket event mapping,
  - polling triggers,
  - repository reconciliation,
  - error/loading lifecycle.
- This creates broad interfaces and tightly-coupled updates, increasing regression risk.

## Proposed Architecture

### 1) Machine Core

Create `src/features/student/hooks/studentSessionStateMachine.ts`.

- Exposes:
  - state type (`StudentSessionMachineState`)
  - event type (`StudentSessionMachineEvent`)
  - transition function (`reduceStudentSessionState`)
  - command/effect descriptors (`StudentSessionCommand`)
- Contains no IO.
- Decides, based on event payload and freshness comparison, whether to:
  - discard stale snapshots,
  - apply attempt/runtime updates,
  - emit observability command payloads,
  - request follow-up effects.

### 2) Effect Adapters

Create `src/features/student/hooks/studentSessionMachineAdapters.ts`.

- Converts command descriptors into real effects:
  - backend calls via `backendGet`,
  - attempt persistence/reconciliation via `studentAttemptRepository`,
  - metrics via `emitStudentObservabilityMetric`,
  - compatibility mapping helpers (`mapBackend*`).
- Adapter outputs normalized event payloads back to machine.

### 3) Hook Shell

Refactor `useStudentSessionRouteData.ts` to:

- hold machine state via `useReducer`,
- dispatch events for:
  - initial load,
  - refresh,
  - retry,
  - websocket event/runtime snapshot,
  - polling tick,
- execute commands through adapter runner.

The hook remains the integration boundary for React lifecycles and subscriptions (`useLiveUpdates`, `useAsyncPolling`), while machine owns decision logic.

## State Model

States:

- `idle`
- `loading`
- `ready`
- `refreshing`
- `error`

Core fields retained:

- `schedule`, `state`, `runtimeSnapshot`, `attemptSnapshot`
- `answerInvariantRollout`
- `isLoading`, `error`
- freshness tracking and epoch supersede guard

## Event Model

Primary events:

- `LOAD_REQUESTED`
- `LOAD_SUCCEEDED`
- `LOAD_FAILED`
- `LIVE_REFRESH_REQUESTED`
- `LIVE_REFRESH_SUCCEEDED`
- `LIVE_REFRESH_FAILED`
- `LIVE_EVENT_RECEIVED`
- `RUNTIME_SNAPSHOT_RECEIVED`
- `RETRY_REQUESTED`

## TDD Strategy (Vertical Slices)

### Slice 1 (Tracer Bullet, Priority)

Behavior: stale live refresh snapshot does not regress applied attempt/runtime.

- Add failing test in hook/backend test suite that simulates regressive live refresh payload.
- Implement minimal machine freshness transition to make it pass.

### Slice 2

Behavior: equal/newer freshness is applied correctly and updates runtime/attempt snapshots.

### Slice 3

Behavior: initial load path parity remains unchanged under machine orchestration.

### Slice 4

Behavior: retry/recovery path preserves prior semantics after transient backend failure.

## Testing Plan

- Keep public-behavior tests in:
  - `useStudentSessionRouteData.backend.test.tsx`
- Add focused machine unit tests:
  - `studentSessionStateMachine.test.ts`
- Avoid implementation-coupled assertions (test outcomes, not internals).

## Migration Plan

1. Introduce machine and adapters with no external wiring impact.
2. Wire hook to machine for live refresh arbitration first.
3. Migrate initial load and retry paths.
4. Remove obsolete in-hook transition logic.
5. Run targeted student hook tests and diagnostics.

## Risks and Mitigations

- Risk: subtle freshness behavior drift.
  - Mitigation: tracer-bullet stale-discard test first, preserve existing helper usage.
- Risk: command runner introduces async ordering differences.
  - Mitigation: explicit epoch checks in machine state and command result handling.
- Risk: oversized refactor.
  - Mitigation: strict slice-by-slice TDD and minimal changes per cycle.

## Acceptance Criteria

- Hook API unchanged.
- Existing student route hook tests pass.
- New machine tests pass for stale discard and forward apply behavior.
- No new diagnostics errors in touched files.
