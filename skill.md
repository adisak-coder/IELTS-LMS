---
name: systems-engineer-core
description: >
  Universal software engineering mental model. Write any code with systems
  rigor: TDD-first, testable architecture, pure logic separated from I/O,
  typed errors, and composable abstractions. Use for all production code,
  design reviews, refactoring, and architecture audits.
---

# Core Systems Engineering Credo

## Mindset
**Correctness first. Performance second. Convenience third.**  
Assume requirements will change. Design for extension, not breakage. Every public function is a contract; enforce it.

---

## The Four Laws

### 1. Logic is Pure; I/O is Explicit
Business rules must run without a database, network, file system, or framework.  
**Rule:** If testing a calculation requires spinning up infra, the architecture is wrong.

### 2. Depend on Abstractions, Not Concretions
Inject dependencies. Never let core code instantiate infrastructure.  
**Rule:** If you can swap the DB for an in-memory fake without touching domain code, you win.

### 3. Make Invalid States Unrepresentable
Use types to enforce constraints at the boundary. Parse, don't validate.  
`Email` > `string`. `Paid | Pending` > `isPaid: boolean`.  
**Rule:** If bad data can exist, the type is too wide.

### 4. Errors Are Data, Not Strings
Return typed results. Bubble context. Log once at boundaries. Never swallow. Never use `null` for expected failure.

---

## TDD as Design Discipline

Red → Green → Refactor in 2–5 minute cycles.

- **Red:** Write one behavioral test. Watch it fail.  
- **Green:** Write the minimal code to pass (hardcode if needed).  
- **Refactor:** Clean without changing behavior.

**Test behavior, not implementation.** One concept per test.  
Name tests like sentences: `rejects_negative_amount`.  
If code is hard to test, it's coupled. **Fix the design, not the test.**

---

## Architecture Rules

- **Single Responsibility:** One reason to change per module. If you scroll, split.
- **Boundary Discipline:** Adapters (HTTP/CLI/DB) → Domain (pure rules) → Infrastructure (I/O).
- **Composition > Inheritance:** Small functions, shallow abstractions.
- **No Globals / No Hidden State:** Explicit ownership, explicit lifetimes.
- **Stable Naming:** `parse_*`, `validate_*`, `compute_*`, `render_*`.

---

## Testing Strategy

- **Unit (most):** Pure logic. Zero I/O. Fast.
- **Integration (some):** Boundaries and wiring. In-memory or testcontainers.
- **E2E (few):** Critical paths only.

**Mocking is a warning light.** Needing 3+ mocks means the unit does too much.

---

## Error & Resource Contract

- Acquire late, release early. Deterministic cleanup.
- Validate at boundaries. Trust internals.
- Include correlation IDs. Don't double-log the same error up the stack.

---

## Before You Ship (Self-Gate)

- [ ] Can domain code run without real network/DB?
- [ ] Are invariants enforced by types or constructors?
- [ ] Are side effects isolated and obvious?
- [ ] Would a stranger understand this in 6 months?
- [ ] Do tests fail if behavior breaks, not if internals shift?

---

## Exam Builder Hardening Checklist

- **IDs:** Never use `Date.now()` for IDs that live in `ExamState` (passages/blocks/questions/options/blanks/pins/images/annotations). Use `createId()` from `src/utils/idUtils.ts`.
- **HTML safety:** Any `dangerouslySetInnerHTML` must wrap content with `sanitizeHtml()` from `src/utils/sanitizeHtml.ts`.
- **Matching blocks:** Every paragraph must have a selected heading; validation must return an `error` for missing or orphaned headings.

Quick audit commands:

```bash
rg -n "Date\\.now\\(\\)" src/components/blocks src/components/QuestionBuilderPane.tsx src/components/Workspace.tsx
rg -n "dangerouslySetInnerHTML" src/components
```

---

## 60-Second Architecture Audit

Score 1–10. Check:

1. Can business rules execute without infrastructure?
2. Are dependencies injected, not constructed internally?
3. Are units testable in isolation with ≤2 mocks?
4. Is the pyramid bottom-heavy (units > integration > E2E)?
5. Are invalid states preventable by the type system?

**Fix in order:** separate I/O → inject dependencies → split large units → push tests down the pyramid.
