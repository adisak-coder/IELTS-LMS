# ADR 0001: Reading Highlight Rewrite to Tiptap (Big-Bang)

- Status: Accepted
- Date: 2026-05-09
- Owners: Student Runtime / Reading Experience
- Related:
  - /Users/rd-cream/Downloads/remix_-ielts-proctoring-system/docs/architecture/student-reading-highlight-tiptap-big-bang.md
  - /Users/rd-cream/Downloads/remix_-ielts-proctoring-system/CONTEXT.md

## Context

The existing reading highlight implementation is coupled to live DOM mutation and persisted HTML. This created failure patterns that are hard to debug and hard to make deterministic:

- selection behavior depends on browser range quirks,
- repeated highlight actions can produce nested `<mark>` structures,
- HTML text normalization can drift from rendered structure,
- persisted mutated HTML is brittle and not a reliable source of truth.

Exam runtime needs a reliable highlight mechanism that survives browser close/reopen without introducing backend coupling.

## Decision

We will replace the reading highlight subsystem with a **big-bang** migration to **Tiptap (ProseMirror)** read-only rendering and decoration-driven highlights.

### Non-negotiable policy

1. Reading highlights use structured range state, not persisted mutated HTML.
2. Persistence is local-only and attempt-scoped, and must restore after browser close/reopen.
3. Ranges are block-local offsets and normalized to non-overlapping sets.
4. Reading highlight colors preserve existing IDs:
   - `yellow`
   - `amber` (label remains Pink)
   - `green`
   - `blue`
5. Click/tap remove deletes only the targeted highlight span.
6. Cross-block selection does not produce highlight writes.

## Architectural Shape

- Domain layer (pure): range invariants, merge/split/remove, validation.
- Application layer: highlight use-cases and policy orchestration.
- Infrastructure layer: local snapshot storage adapter.
- UI layer: Tiptap read-only viewer + decorations + selection mapping.

No module outside the highlight application layer may mutate highlight state directly.

## Rejected Alternatives

### A) Keep current DOM mutation path and patch edge cases

Rejected because complexity and browser-specific fragility continue to accumulate.

### B) Strangler/feature-flag rollout

Rejected by product/engineering decision for this migration; big-bang is explicitly selected.

### C) Event-sourced highlight log

Rejected for v1 as unnecessary complexity. Snapshot persistence is sufficient for current requirements.

## Consequences

### Positive

- Deterministic highlight behavior from structured state.
- Testability improves via pure domain tests and invariant enforcement.
- Eliminates nested-mark corruption class from source-of-truth model.

### Costs / Risks

- Large migration blast radius due to big-bang cutover.
- Requires careful selection mapping and touch-device validation.
- Temporary development slowdown while replacing old stack.

## Guardrails

- Invariant checks must run at write boundaries.
- Invalid persisted payload must fail closed (drop payload, continue runtime).
- Storage failures must not block exam flow.
- Reading path must have no HTML highlight persistence after cutover.

## Rollback Strategy

If migration introduces critical runtime regressions before release, revert to previous stable commit and postpone cutover. There is no runtime dual-path fallback in this decision.

## Implementation Notes

Detailed module plan, contracts, and acceptance criteria are defined in:

- /Users/rd-cream/Downloads/remix_-ielts-proctoring-system/docs/architecture/student-reading-highlight-tiptap-big-bang.md
