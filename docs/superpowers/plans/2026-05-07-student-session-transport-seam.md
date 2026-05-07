# Student Session Transport Seam Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete option `C` by moving route, repository, and query student session calls behind one typed transport interface.

**Architecture:** Replace endpoint-string usage with a deep `StudentSessionTransport` module that owns URL construction and backend call wrappers. Keep route/repository/query modules as callers of transport methods only, so student session contract drift is impossible without changing one seam. Preserve existing request behavior, headers, retries, and response-mode flags.

**Tech Stack:** React, TypeScript, Vitest, existing `backendGet/backendPost` bridge.

---

### Task 1: Build Typed Student Transport Interface

**Files:**
- Modify: `src/services/studentSessionTransport.ts`
- Test: `src/services/__tests__/studentSessionTransport.test.ts`

- [ ] **Step 1: Write the failing transport seam tests**

```ts
// src/services/__tests__/studentSessionTransport.test.ts
import { describe, expect, it } from 'vitest';
import {
  studentSessionTransport,
  candidateIdFromStudentKey,
} from '../studentSessionTransport';

describe('studentSessionTransport endpoints', () => {
  it('builds session/static/live endpoints with candidateId', () => {
    expect(studentSessionTransport.paths.session('sched-1', 'W123456'))
      .toBe('/v1/student/sessions/sched-1?candidateId=W123456');
    expect(studentSessionTransport.paths.staticSession('sched-1', 'W123456'))
      .toBe('/v1/student/sessions/sched-1/static?candidateId=W123456');
    expect(studentSessionTransport.paths.liveSession('sched-1', 'W123456'))
      .toBe('/v1/student/sessions/sched-1/live?candidateId=W123456');
  });

  it('builds credential refresh endpoint', () => {
    expect(
      studentSessionTransport.paths.refreshAttemptCredential(
        'sched-1',
        'W123456',
        'client-1',
      ),
    ).toBe(
      '/v1/student/sessions/sched-1?candidateId=W123456&refreshAttemptCredential=true&clientSessionId=client-1',
    );
  });

  it('derives candidateId from studentKey', () => {
    expect(candidateIdFromStudentKey('sched-1', 'student-sched-1-W123456')).toBe('W123456');
    expect(candidateIdFromStudentKey('sched-1', '')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/services/__tests__/studentSessionTransport.test.ts`  
Expected: FAIL with missing `studentSessionTransport` interface or `paths` members.

- [ ] **Step 3: Write minimal transport interface + path adapters**

```ts
// src/services/studentSessionTransport.ts (shape)
export interface StudentSessionTransport {
  paths: {
    session: (scheduleId: string, candidateId: string) => string;
    staticSession: (scheduleId: string, candidateId: string) => string;
    liveSession: (scheduleId: string, candidateId: string) => string;
    refreshAttemptCredential: (
      scheduleId: string,
      candidateId: string,
      clientSessionId: string,
    ) => string;
    precheck: (scheduleId: string) => string;
    bootstrap: (scheduleId: string) => string;
    mutationsBatch: (scheduleId: string) => string;
    heartbeat: (scheduleId: string, responseMode?: 'ack' | 'full') => string;
    audit: (scheduleId: string) => string;
    submit: (scheduleId: string) => string;
  };
}

export const studentSessionTransport: StudentSessionTransport = {
  paths: {
    session: buildStudentSessionEndpoint,
    staticSession: buildStudentStaticSessionEndpoint,
    liveSession: buildStudentLiveSessionEndpoint,
    refreshAttemptCredential: buildStudentCredentialRefreshEndpoint,
    precheck: buildStudentPrecheckEndpoint,
    bootstrap: buildStudentBootstrapEndpoint,
    mutationsBatch: buildStudentMutationsBatchEndpoint,
    heartbeat: buildStudentHeartbeatEndpoint,
    audit: buildStudentAuditEndpoint,
    submit: buildStudentSubmitEndpoint,
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/services/__tests__/studentSessionTransport.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/studentSessionTransport.ts src/services/__tests__/studentSessionTransport.test.ts
git commit -m "refactor: add typed student session transport seam"
```

### Task 2: Migrate Query Layer to Transport Methods

**Files:**
- Modify: `src/app/data/studentSessionQueries.ts`
- Test: `src/app/data/__tests__/studentSessionQueries.test.ts` (create if missing)

- [ ] **Step 1: Write failing query-layer test around transport seam usage**

```ts
// src/app/data/__tests__/studentSessionQueries.test.ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../services/backendBridge', () => ({
  backendGet: vi.fn(async () => ({})),
}));

vi.mock('../../../services/studentSessionTransport', () => ({
  studentSessionTransport: {
    paths: {
      staticSession: vi.fn(() => '/v1/student/sessions/sched-1/static?candidateId=W123456'),
      liveSession: vi.fn(() => '/v1/student/sessions/sched-1/live?candidateId=W123456'),
    },
  },
}));

import { fetchStudentStaticSession, fetchStudentLiveSession } from '../studentSessionQueries';
import { backendGet } from '../../../services/backendBridge';

describe('studentSessionQueries transport seam', () => {
  it('uses transport paths for static/live fetches', async () => {
    await fetchStudentStaticSession('sched-1', 'W123456');
    await fetchStudentLiveSession('sched-1', 'W123456');
    expect(backendGet).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/data/__tests__/studentSessionQueries.test.ts`  
Expected: FAIL until file uses `studentSessionTransport.paths`.

- [ ] **Step 3: Replace direct builders with transport seam**

```ts
// src/app/data/studentSessionQueries.ts (core shape)
import { studentSessionTransport } from '../../services/studentSessionTransport';

export function fetchStudentStaticSession(scheduleId: string, candidateId: string) {
  return backendGet<BackendStudentStaticSessionContext>(
    studentSessionTransport.paths.staticSession(scheduleId, candidateId),
  );
}

export function fetchStudentLiveSession(scheduleId: string, candidateId: string) {
  return backendGet<BackendStudentLiveSessionContext>(
    studentSessionTransport.paths.liveSession(scheduleId, candidateId),
  );
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run src/app/data/__tests__/studentSessionQueries.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/data/studentSessionQueries.ts src/app/data/__tests__/studentSessionQueries.test.ts
git commit -m "refactor: route query layer through student session transport"
```

### Task 3: Migrate Student Route Hook to Transport Methods

**Files:**
- Modify: `src/features/student/hooks/useStudentSessionRouteData.ts`
- Test: `src/features/student/hooks/__tests__/useStudentSessionRouteData.backend.test.tsx`

- [ ] **Step 1: Write failing hook test that asserts transport seam call path**

```ts
// inside useStudentSessionRouteData.backend.test.tsx
import { studentSessionTransport } from '@services/studentSessionTransport';

vi.spyOn(studentSessionTransport.paths, 'session');
vi.spyOn(studentSessionTransport.paths, 'staticSession');
vi.spyOn(studentSessionTransport.paths, 'liveSession');

// render hook and trigger load
expect(studentSessionTransport.paths.session).toHaveBeenCalled();
expect(studentSessionTransport.paths.liveSession).toHaveBeenCalled();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/student/hooks/__tests__/useStudentSessionRouteData.backend.test.tsx`  
Expected: FAIL before migration if raw string construction remains.

- [ ] **Step 3: Replace all student URL call sites with transport seam**

```ts
// useStudentSessionRouteData.ts (examples)
studentSessionTransport.paths.staticSession(scheduleId, candidateId)
studentSessionTransport.paths.session(scheduleId, candidateId)
studentSessionTransport.paths.liveSession(scheduleId, candidateId)
```

- [ ] **Step 4: Run test to verify pass**

Run: `npx vitest run src/features/student/hooks/__tests__/useStudentSessionRouteData.backend.test.tsx`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/student/hooks/useStudentSessionRouteData.ts src/features/student/hooks/__tests__/useStudentSessionRouteData.backend.test.tsx
git commit -m "refactor: route student session hook through transport seam"
```

### Task 4: Migrate Repository + Audit Layer to Transport Methods

**Files:**
- Modify: `src/services/studentAttemptRepository.ts`
- Modify: `src/services/studentAuditService.ts`
- Test: `src/services/__tests__/studentAttemptRepository.backend.test.ts`
- Test: `src/services/__tests__/studentAttemptRepository.test.ts`

- [ ] **Step 1: Write failing repository tests for all student routes via seam**

```ts
// in studentAttemptRepository.backend.test.ts
import { studentSessionTransport } from '../studentSessionTransport';

const spyBootstrap = vi.spyOn(studentSessionTransport.paths, 'bootstrap');
const spyMutation = vi.spyOn(studentSessionTransport.paths, 'mutationsBatch');
const spyHeartbeat = vi.spyOn(studentSessionTransport.paths, 'heartbeat');
const spySubmit = vi.spyOn(studentSessionTransport.paths, 'submit');

// execute repository actions...
expect(spyBootstrap).toHaveBeenCalled();
expect(spyMutation).toHaveBeenCalled();
expect(spyHeartbeat).toHaveBeenCalled();
expect(spySubmit).toHaveBeenCalled();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/services/__tests__/studentAttemptRepository.backend.test.ts src/services/__tests__/studentAttemptRepository.test.ts`  
Expected: FAIL while direct URL strings remain.

- [ ] **Step 3: Replace repository and audit direct student URLs with transport**

```ts
// studentAttemptRepository.ts (examples)
studentSessionTransport.paths.refreshAttemptCredential(scheduleId, candidateId, clientSessionId)
studentSessionTransport.paths.session(scheduleId, candidateId)
studentSessionTransport.paths.bootstrap(scheduleId)
studentSessionTransport.paths.mutationsBatch(scheduleId)
studentSessionTransport.paths.heartbeat(scheduleId, 'ack')
studentSessionTransport.paths.audit(scheduleId)
studentSessionTransport.paths.submit(scheduleId)
```

```ts
// studentAuditService.ts
studentSessionTransport.paths.audit(sessionId)
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run src/services/__tests__/studentAttemptRepository.backend.test.ts src/services/__tests__/studentAttemptRepository.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/studentAttemptRepository.ts src/services/studentAuditService.ts src/services/__tests__/studentAttemptRepository.backend.test.ts src/services/__tests__/studentAttemptRepository.test.ts
git commit -m "refactor: move repository student calls behind transport seam"
```

### Task 5: Final Verification + Cleanup

**Files:**
- Modify: `src/services/studentSessionTransport.ts` (if exports cleanup needed)
- Modify: `src/app/data/studentSessionQueries.ts` (remove dead imports/functions)
- Modify: `src/features/student/hooks/useStudentSessionRouteData.ts` (remove dead builders/types)

- [ ] **Step 1: Remove dead string-builder usage and normalize exports**

```ts
// Keep one public seam:
export { studentSessionTransport, candidateIdFromStudentKey };
// Keep legacy endpoint functions only if still needed by tests; otherwise remove.
```

- [ ] **Step 2: Run targeted verification**

Run:
```bash
npx vitest run \
  src/services/__tests__/studentSessionTransport.test.ts \
  src/services/__tests__/studentAttemptRepository.test.ts \
  src/services/__tests__/studentAttemptRepository.backend.test.ts \
  src/features/student/hooks/__tests__/useStudentSessionRouteData.backend.test.tsx \
  src/components/student/__tests__/StudentWriting.lifecycle.test.tsx
```

Expected: PASS for all listed tests.

- [ ] **Step 3: Run diagnostics on touched files**

Run VS Code diagnostics for:
- `src/services/studentSessionTransport.ts`
- `src/app/data/studentSessionQueries.ts`
- `src/features/student/hooks/useStudentSessionRouteData.ts`
- `src/services/studentAttemptRepository.ts`
- `src/services/studentAuditService.ts`

Expected: no new TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/services/studentSessionTransport.ts src/app/data/studentSessionQueries.ts src/features/student/hooks/useStudentSessionRouteData.ts src/services/studentAttemptRepository.ts src/services/studentAuditService.ts
git commit -m "chore: finalize unified student session transport seam"
```

---

## Spec Coverage Check

- Route + repository + query all consume a single transport seam: covered in Tasks 2, 3, 4.
- Candidate identity consistency (`candidateId` canonical): covered in Task 4 via `candidateIdFromStudentKey` + transport path methods.
- No raw `/v1/student/sessions/...` construction in those modules: enforced in Tasks 2–5.
- Behavior preservation for retries/headers/ack/full heartbeat modes: covered in Task 4 and verification Task 5.

## Placeholder Scan

- No `TODO`/`TBD`/“implement later”.
- Each code-changing step includes concrete code shape.
- Each verification step includes exact command and expected result.

## Type Consistency Check

- One seam name used everywhere: `studentSessionTransport`.
- One path namespace: `studentSessionTransport.paths.*`.
- `candidateIdFromStudentKey(scheduleId, studentKey)` used only where `studentKey` entry exists.
