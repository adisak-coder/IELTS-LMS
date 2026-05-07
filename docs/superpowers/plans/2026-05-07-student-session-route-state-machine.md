# Student Session Route State Machine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `useStudentSessionRouteData` to an internal state-machine architecture while preserving its public API and behavior.

**Architecture:** Introduce a pure transition/reducer machine and command-based effect adapters, then turn the existing hook into a thin orchestration shell that dispatches events and executes commands. Migrate behavior incrementally with TDD, starting from stale live-refresh freshness arbitration as tracer bullet.

**Tech Stack:** React hooks, TypeScript, Vitest, existing backend bridge and student repository services.

---

### Task 1: Add Tracer-Bullet Freshness Regression Test (RED)

**Files:**
- Modify: `src/features/student/hooks/__tests__/useStudentSessionRouteData.backend.test.tsx`
- Test: `src/features/student/hooks/__tests__/useStudentSessionRouteData.backend.test.tsx`

- [ ] **Step 1: Add failing behavior test for stale live refresh**

```ts
it('does not regress applied runtime/attempt when live refresh returns stale freshness', async () => {
  // Arrange responses so first load has higher freshness than subsequent refresh.
  // Trigger refresh via hook retry/refreshRuntime path.
  // Assert runtimeSnapshot and attemptSnapshot remain at newer values.
});
```

- [ ] **Step 2: Run test and confirm RED**

Run: `npx vitest run src/features/student/hooks/__tests__/useStudentSessionRouteData.backend.test.tsx -t "does not regress applied runtime/attempt when live refresh returns stale freshness"`
Expected: FAIL (stale snapshot is currently applied or behavior not machine-governed yet)

- [ ] **Step 3: Commit test-only RED state**

```bash
git add src/features/student/hooks/__tests__/useStudentSessionRouteData.backend.test.tsx
git commit -m "test: add stale live-refresh regression guard for student session hook"
```

### Task 2: Introduce Machine Core (GREEN for Task 1)

**Files:**
- Create: `src/features/student/hooks/studentSessionStateMachine.ts`
- Test: `src/features/student/hooks/__tests__/studentSessionStateMachine.test.ts`

- [ ] **Step 1: Add minimal machine model and reducer surface**

```ts
export type StudentSessionMachineState = { ... };
export type StudentSessionMachineEvent = { type: 'LIVE_REFRESH_SUCCEEDED'; ... } | ...;
export type StudentSessionCommand = { type: 'EMIT_OBSERVABILITY'; ... } | ...;
export function reduceStudentSessionState(
  state: StudentSessionMachineState,
  event: StudentSessionMachineEvent,
): { state: StudentSessionMachineState; commands: StudentSessionCommand[] } {
  // minimal transitions for stale-discard tracer bullet
}
```

- [ ] **Step 2: Add focused reducer test for stale discard**

```ts
it('discards regressive live freshness updates', () => {
  const result = reduceStudentSessionState(baseState, staleLiveRefreshEvent);
  expect(result.state.runtimeSnapshot).toEqual(baseState.runtimeSnapshot);
  expect(result.state.attemptSnapshot).toEqual(baseState.attemptSnapshot);
});
```

- [ ] **Step 3: Run machine tests**

Run: `npx vitest run src/features/student/hooks/__tests__/studentSessionStateMachine.test.ts`
Expected: PASS

- [ ] **Step 4: Commit machine core slice**

```bash
git add src/features/student/hooks/studentSessionStateMachine.ts src/features/student/hooks/__tests__/studentSessionStateMachine.test.ts
git commit -m "feat: add student session state machine core with stale freshness discard"
```

### Task 3: Add Effect Adapter Runner

**Files:**
- Create: `src/features/student/hooks/studentSessionMachineAdapters.ts`
- Modify: `src/features/student/hooks/useStudentSessionRouteData.ts`
- Test: `src/features/student/hooks/__tests__/useStudentSessionRouteData.backend.test.tsx`

- [ ] **Step 1: Implement adapter command executor**

```ts
export async function runStudentSessionCommands(
  commands: StudentSessionCommand[],
  deps: StudentSessionMachineAdapterDeps,
): Promise<StudentSessionMachineEvent[]> {
  // execute backend/repository/metrics side-effects and return follow-up events
}
```

- [ ] **Step 2: Wire hook to dispatch refresh events through machine + adapter**

```ts
const [machineState, dispatch] = useReducer(...);
const runCommands = useCallback(async (commands) => { ...dispatch(followUpEvent)... }, [...]);
```

- [ ] **Step 3: Run tracer-bullet hook test**

Run: `npx vitest run src/features/student/hooks/__tests__/useStudentSessionRouteData.backend.test.tsx -t "does not regress applied runtime/attempt when live refresh returns stale freshness"`
Expected: PASS

- [ ] **Step 4: Commit refresh-path integration**

```bash
git add src/features/student/hooks/studentSessionMachineAdapters.ts src/features/student/hooks/useStudentSessionRouteData.ts src/features/student/hooks/__tests__/useStudentSessionRouteData.backend.test.tsx
git commit -m "refactor: route live refresh decisions through student session state machine"
```

### Task 4: Expand Machine Coverage for Forward/Equal Freshness

**Files:**
- Modify: `src/features/student/hooks/__tests__/studentSessionStateMachine.test.ts`
- Modify: `src/features/student/hooks/studentSessionStateMachine.ts`

- [ ] **Step 1: Add RED tests for equal/newer freshness apply behavior**

```ts
it('applies equal/newer runtime freshness', () => { ... });
it('applies equal/newer attempt freshness', () => { ... });
```

- [ ] **Step 2: Implement minimal transition support for apply cases**

```ts
// use compareFreshnessDimension and apply flags to mutate state safely
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/features/student/hooks/__tests__/studentSessionStateMachine.test.ts`
Expected: PASS

- [ ] **Step 4: Commit apply-behavior slice**

```bash
git add src/features/student/hooks/studentSessionStateMachine.ts src/features/student/hooks/__tests__/studentSessionStateMachine.test.ts
git commit -m "feat: support forward/equal live freshness apply in student session machine"
```

### Task 5: Migrate Initial Load + Retry Through Machine

**Files:**
- Modify: `src/features/student/hooks/useStudentSessionRouteData.ts`
- Modify: `src/features/student/hooks/studentSessionMachineAdapters.ts`
- Modify: `src/features/student/hooks/studentSessionStateMachine.ts`
- Test: `src/features/student/hooks/__tests__/useStudentSessionRouteData.backend.test.tsx`

- [ ] **Step 1: Add RED tests for initial load parity + retry recovery**

```ts
it('loads schedule/state/runtime/attempt with same public output as before', async () => { ... });
it('recovers from transient backend error on retry without API drift', async () => { ... });
```

- [ ] **Step 2: Route LOAD/RETRY events through machine commands**

```ts
dispatch({ type: 'LOAD_REQUESTED', ... });
// adapter executes fetch/reconcile commands then dispatches LOAD_SUCCEEDED / LOAD_FAILED
```

- [ ] **Step 3: Run targeted hook suite**

Run: `npx vitest run src/features/student/hooks/__tests__/useStudentSessionRouteData.backend.test.tsx`
Expected: PASS

- [ ] **Step 4: Commit load/retry migration**

```bash
git add src/features/student/hooks/useStudentSessionRouteData.ts src/features/student/hooks/studentSessionMachineAdapters.ts src/features/student/hooks/studentSessionStateMachine.ts src/features/student/hooks/__tests__/useStudentSessionRouteData.backend.test.tsx
git commit -m "refactor: migrate student session load and retry flows to state machine"
```

### Task 6: Remove Obsolete In-Hook Transition Logic + Verify

**Files:**
- Modify: `src/features/student/hooks/useStudentSessionRouteData.ts`
- Modify: `src/features/student/hooks/studentSessionStateMachine.ts`
- Test: `src/features/student/hooks/__tests__/useStudentSessionRouteData.backend.test.tsx`

- [ ] **Step 1: Delete superseded transition logic from hook and keep shell responsibilities only**

```ts
// keep hooks wiring only: subscriptions, dispatches, returned API mapping
```

- [ ] **Step 2: Run diagnostics for touched files**

Run diagnostics:
- `src/features/student/hooks/useStudentSessionRouteData.ts`
- `src/features/student/hooks/studentSessionStateMachine.ts`
- `src/features/student/hooks/studentSessionMachineAdapters.ts`

Expected: no new errors.

- [ ] **Step 3: Run final targeted tests**

Run:
- `npx vitest run src/features/student/hooks/__tests__/studentSessionStateMachine.test.ts`
- `npx vitest run src/features/student/hooks/__tests__/useStudentSessionRouteData.backend.test.tsx`

Expected: PASS

- [ ] **Step 4: Commit cleanup/finalization**

```bash
git add src/features/student/hooks/useStudentSessionRouteData.ts src/features/student/hooks/studentSessionStateMachine.ts src/features/student/hooks/studentSessionMachineAdapters.ts src/features/student/hooks/__tests__/studentSessionStateMachine.test.ts src/features/student/hooks/__tests__/useStudentSessionRouteData.backend.test.tsx
git commit -m "refactor: finalize student session route state machine architecture"
```

### Task 7: Regression Check for Adjacent Student Flows

**Files:**
- Test: `src/services/__tests__/studentAttemptRepository.backend.test.ts`
- Test: `src/services/__tests__/studentAuditService.test.ts`

- [ ] **Step 1: Run adjacent regression tests**

Run:
- `npx vitest run src/services/__tests__/studentAttemptRepository.backend.test.ts`
- `npx vitest run src/services/__tests__/studentAuditService.test.ts`

Expected: PASS

- [ ] **Step 2: Commit verification evidence (if test fixtures adjusted)**

```bash
git add -A
git commit -m "test: verify student session state machine refactor against adjacent flows"
```
