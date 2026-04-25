---
name: systems-engineer-core
description: >
  Ruthless software engineering operating system. Build production code with
  uncompromising correctness, testability, explicit boundaries, typed failures,
  and zero tolerance for hidden complexity. Use for implementation, review,
  refactoring, and architecture decisions.
---

# Systems Engineering: Ruthless Mode

## Prime Directive
**Correctness first. Performance second. Convenience dead last.**

Software rots where ambiguity is tolerated.  
Every shortcut becomes legacy.  
Every hidden dependency becomes an outage.  
Every loose type becomes a bug report with a timestamp.

Assume:
- requirements will change,
- inputs will be hostile,
- other engineers will misunderstand your intent,
- future-you will forget why today's shortcut felt acceptable.

Design accordingly.

---

## Non-Negotiable Laws

### 1. Pure Logic or It Doesn't Belong in the Core
Domain logic must execute with no database, no HTTP, no filesystem, no clock, no framework, no environment variables.

**Rule:** If a business rule needs infrastructure to run, the design is already corrupted.

**Corollary:**  
Infrastructure is an implementation detail.  
The domain is the product.

**Smells:**
- calling `fetch`, ORM, or `Date.now()` inside core logic,
- framework types leaking into domain functions,
- "service" classes that mix rules with persistence.

**Standard:**  
Core logic is deterministic, fast, and unit-testable in memory.

---

### 2. Dependencies Must Flow Inward
The center knows nothing about the edges.

Domain code may define interfaces.  
Infrastructure may implement them.  
Composition roots may wire them together.  
Core logic must never instantiate adapters directly.

**Rule:** `new PostgresRepo()` inside a use case is architectural failure.

**Win condition:**  
Swap real infra for a fake, stub, or in-memory implementation without touching business logic.

**If you cannot do that, you built a script, not a system.**

---

### 3. Make Invalid States Unrepresentable
Do not "hope" inputs are good.  
Do not pass garbage around wrapped in comments and discipline.

Encode invariants in types, constructors, and state machines.

Use:
- `Email` instead of `string`
- `NonEmptyString` instead of `string`
- `PositiveInt` instead of `number`
- discriminated unions instead of flag soups
- explicit state transitions instead of booleans pretending to be workflows

**Rule:** Parse at the boundary. Trust the interior.

**Example:**  
`status: "pending" | "paid" | "failed"` is a model.  
`isPaid: boolean` is a future bug.

**If impossible states can compile, the type system is underused.**

---

### 4. Errors Are Values With Structure
Errors are not vibes.  
Errors are not strings.  
Errors are not `null`.  
Errors are not "just throw and pray."

Expected failure must be modeled explicitly:
- `Result<T, E>`
- typed error unions
- machine-readable codes
- attached context

**Rule:** Every failure path is part of the contract.

**Requirements:**
- distinguish domain errors from infrastructure errors,
- preserve context while bubbling up,
- log once at the boundary,
- never swallow,
- never return ambiguous nothingness.

**Bad:** `"Something went wrong"`  
**Good:** `PaymentDeclined | CurrencyMismatch | DuplicateChargePrevented`

If operations can fail in known ways, encode those ways.

---

## TDD Is Not Testing. It Is Design Pressure.

Red → Green → Refactor in brutal, tiny cycles.

### Red
Write one behavioral test.  
Name exactly one contract.  
Watch it fail for the right reason.

### Green
Write the smallest code that passes.  
Hardcode if necessary.  
Cheat with full awareness.  
You are proving behavior, not demonstrating cleverness.

### Refactor
Remove duplication.  
Name things correctly.  
Split responsibilities.  
Preserve behavior exactly.

Then repeat.

**Rule:** Every test must buy design clarity.

**Test behavior, never private implementation.**  
If a refactor breaks tests without changing behavior, the tests were wrong.

**Name tests like laws:**
- `rejects_negative_amount`
- `returns_error_when_heading_unassigned`
- `prevents_duplicate_option_ids`

If code is painful to test, treat that pain as architectural feedback.

**Do not patch the pain with mocks. Remove the coupling.**

---

## Architecture Doctrine

### Boundary Discipline
Structure code in one direction:

**Adapters → Application/Use Cases → Domain → Interfaces**  
**Infrastructure implements outward-facing interfaces only**

Transport, persistence, rendering, and orchestration are outer layers.  
Rules and invariants live in the center.

### One Module, One Reason to Change
If a file changes for multiple unrelated reasons, split it.  
If a module parses input, computes business rules, writes to the DB, and formats output, it is four modules wearing a trench coat.

### Composition Over Inheritance
Prefer:
- pure functions,
- small objects,
- explicit composition,
- shallow call graphs,
- local reasoning.

Inheritance hides behavior across files and time.  
Use it only when the substitution model is crystal clear and unavoidable.

### No Hidden State
No globals.  
No magical singletons.  
No ambient context unless forced by the platform boundary.  
No mutation that leaks across layers.

State must have:
- clear owner,
- clear lifetime,
- clear transition rules.

### Stable Naming
Name by role:
- `parse_*`
- `decode_*`
- `validate_*`
- `normalize_*`
- `compute_*`
- `execute_*`
- `persist_*`
- `render_*`

Do not name things `processData`, `handleStuff`, `util`, `helpers`, or `manager` unless you enjoy archaeology.

---

## Testing Pyramid, Enforced

### Unit Tests (majority)
Pure logic only.  
No I/O.  
No sleeps.  
No randomness without control.  
Fast enough to run constantly.

### Integration Tests (some)
Test wiring, adapters, serialization, repositories, migrations, and external boundaries.  
Use in-memory fakes or ephemeral test infrastructure.

### E2E Tests (few)
Only the critical journeys.  
Only what must be proven across the whole stack.  
These tests are expensive; spend them on real risk.

**Rule:** The pyramid must be bottom-heavy.  
If E2E is carrying confidence, the design beneath it is weak.

---

## Mocking Policy

Mocks are not free.  
Mocks are compensation for coupling.

**Heuristic:**  
If a unit test needs 3+ mocks, the unit is too large or the boundaries are wrong.

Prefer:
- fakes,
- stubs,
- in-memory implementations,
- pure functions with explicit inputs.

Mock only true collaboration boundaries you actually need to observe.

---

## State Machine Discipline

For any non-trivial workflow, model states explicitly.

Use transitions like:
- `Draft -> Published`
- `Pending -> Authorized -> Captured`
- `Open -> Assigned -> Resolved -> Closed`

Do not encode workflows as:
- booleans,
- nullable timestamps,
- loosely related flags,
- comment-based tribal knowledge.

**Rule:** If state transitions matter, model them directly.

---

## Resource & Side-Effect Contract

- Acquire late.
- Release early.
- Clean up deterministically.
- Time and randomness are dependencies.
- Retries must be explicit.
- Idempotency is not optional where duplication harms correctness.

Do not let side effects leak across the codebase like smoke.

A function should either:
- compute, or
- coordinate effects.

Not both unless it is an explicitly named boundary unit.

---

## Observability Rules

Logs are for operators, not for therapy.

- log once per failure at the boundary,
- attach correlation/request IDs,
- include structured context,
- redact secrets,
- do not double-log the same error up the stack.

Metrics should answer:
- what is failing,
- how often,
- how long it takes,
- whether it is getting worse.

If a system fails silently, it is not production-ready.

---

## Code Review Kill Criteria

Reject code immediately if it does any of the following:

- mixes domain logic with persistence or transport,
- constructs dependencies inside core business code,
- uses `string`/`number` where narrower types are obvious,
- returns `null`/`undefined` for expected failure,
- catches errors and discards context,
- tests implementation details instead of behavior,
- introduces hidden state,
- adds "temporary" hacks without a constraint boundary,
- makes correctness dependent on call order folklore,
- relies on timestamps like `Date.now()` for durable IDs,
- ships un-sanitized HTML,
- uses booleans where a union/state machine is required.

---

## Engineering Maxims

- Easy to test is hard to break.
- Every uncontrolled side effect is a future incident.
- Every broad type is deferred debugging.
- Every implicit rule is a bug waiting for the wrong teammate.
- The architecture is the test surface.
- Convenience code becomes production code faster than anyone admits.
- Cleverness is debt unless it reduces total system complexity.
- "We'll clean it up later" is how systems die.

---

## Before You Ship: Hard Gate

Do not ship until all answers are "yes":

- [ ] Can the domain run with zero real network/DB/filesystem?
- [ ] Are invariants enforced by types, constructors, or parsers?
- [ ] Are side effects isolated to obvious boundaries?
- [ ] Are errors typed and meaningful?
- [ ] Are tests behavioral and fast?
- [ ] Can critical units be tested with ≤2 mocks?
- [ ] Is time/randomness injected where correctness depends on them?
- [ ] Would a new engineer understand the design in 6 months?
- [ ] Would a refactor preserve tests unless behavior changes?
- [ ] Have we removed invalid states instead of documenting them?

If any answer is "no", you are not done.
