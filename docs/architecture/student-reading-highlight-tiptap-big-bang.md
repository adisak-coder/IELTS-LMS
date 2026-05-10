# Student Reading Highlight Rewrite (Big-Bang, Tiptap)

## 1) Decision Summary

This document defines a full replacement of the current Reading highlight stack.

Confirmed decisions:

- Replace current `FormattedText` / DOM mutation highlight path with **Tiptap (ProseMirror)**.
- **Big-bang cutover** (no runtime dual path / no feature flag split for this feature).
- Data model is **structured** (doc AST + normalized ranges), not persisted mutated HTML.
- Persistence is **local-only** and must survive browser close/reopen.
- Keep full existing palette IDs from current code:
  - `yellow`
  - `amber` (UI label remains "Pink")
  - `green`
  - `blue`
- Highlight remove behavior: clicking/tapping one highlight removes only that target span.
- Range model is text-only, non-overlapping (merge/split normalization).

## 2) Problem Statement

Current issues were caused by DOM-coupled behavior:

- Selection fidelity depends on live browser range behavior.
- Repeated highlight actions can create nested `<mark>` stacks.
- HTML-to-text conversion can flatten/duplicate content under wrapper structures.
- Persisted `innerHTML` makes corruption hard to reason about and hard to test.

Target outcome:

- Deterministic highlight behavior independent of incidental DOM structure.
- Stable storage and restore across reload and browser close.
- Strong module boundaries and pure domain logic with adapter-only side effects.

## 3) Scope / Non-Goals

In scope:

- Reading passage highlight engine and persistence.
- Student runtime path and preview path.
- Current palette behavior parity.

Out of scope:

- Writing/listening highlighting architecture changes.
- Server-side highlight sync.
- New highlight colors or annotation types.

## 4) Domain Language (Canonical Terms)

- `PassageDoc`: immutable normalized ProseMirror/Tiptap JSON for one passage block.
- `BlockText`: canonical plain text derived from one `PassageDoc` block node sequence.
- `HighlightRange`: `{ start, end, color }` in **block-local text offsets**.
- `HighlightSet`: normalized, non-overlapping ordered range list for one block.
- `HighlightSnapshot`: persisted map keyed by `{attemptId, section, passageId, blockId}`.

## 5) Invariants (Must Never Break)

1. Range bounds: `0 <= start < end <= blockText.length`.
2. Non-overlap: ranges in one `HighlightSet` never overlap.
3. Determinism: same input doc + same highlight set => same rendered output.
4. Scope safety: range never spans across block IDs.
5. Color validity: `color` must be one of `yellow|amber|green|blue`.
6. Restore safety: invalid persisted payload is discarded, never partially applied.

## 6) Target Architecture (Modular Design)

### 6.1 Layering

- **Domain layer (pure, side-effect free)**
  - Range normalization, merge/split, remove targeting, schema validation.
- **Application layer**
  - Orchestrates select/add/remove/clear operations for one block.
- **Interface layer (UI)**
  - Tiptap editor view, selection hooks, click/tap handlers.
- **Infrastructure layer**
  - Local persistence adapter (`localStorage` initially, optional IndexedDB later).

### 6.2 Module Ownership

- `src/features/student/highlight-domain/`
  - Owns all highlight business rules and invariants.
- `src/features/student/highlight-application/`
  - Owns use-cases (`applySelection`, `removeByAnchor`, `clearBlock`, `restoreSnapshot`).
- `src/features/student/highlight-infra/`
  - Owns persistence keying, serialization, debounce write, restore read.
- `src/features/student/highlight-ui/`
  - Owns Tiptap extension wiring + decorations + input handlers.

No module outside these folders should mutate highlight state directly.

### 6.3 Dependency Rules

- UI depends on application interfaces only.
- Application depends on domain interfaces and injected infra ports.
- Domain depends on nothing external.
- Infra depends on browser APIs only and exposes typed ports.

## 7) Contracts

### 7.1 Types

```ts
type HighlightColor = 'yellow' | 'amber' | 'green' | 'blue';

type HighlightRange = {
  start: number; // inclusive
  end: number;   // exclusive
  color: HighlightColor;
};

type HighlightSet = HighlightRange[]; // sorted by start, non-overlapping

type HighlightBlockKey = {
  attemptId: string;
  section: 'reading';
  passageId: string;
  blockId: string;
};
```

### 7.2 Domain API (Pure)

```ts
normalizeRanges(input: HighlightRange[], blockTextLength: number): HighlightSet
addRange(current: HighlightSet, next: HighlightRange, blockTextLength: number): HighlightSet
removeAtOffset(current: HighlightSet, offset: number): HighlightSet
clearRanges(): HighlightSet
validateSnapshot(payload: unknown): ValidatedHighlightSnapshot | InvalidReason
```

### 7.3 Infra Port

```ts
interface HighlightStore {
  load(key: HighlightBlockKey): HighlightSet | null;
  save(key: HighlightBlockKey, ranges: HighlightSet): void;
  clear(key: HighlightBlockKey): void;
}
```

Errors in `save` must never break exam flow; UI continues with in-memory state.

## 8) Persistence Design

### 8.1 Storage Key

`ielts:highlight:v2:{attemptId}:reading:{passageId}:{blockId}`

### 8.2 Stored Payload

```json
{
  "version": 2,
  "updatedAt": 1746800000000,
  "ranges": [
    { "start": 120, "end": 145, "color": "yellow" }
  ]
}
```

### 8.3 Behavior

- Debounced write after each mutation (recommended 120–250ms).
- Best-effort save (swallow storage quota/security errors).
- On restore:
  - validate schema,
  - validate bounds against current `blockText`,
  - drop invalid payload if any invariant fails.

## 9) Rendering Design (Tiptap)

### 9.1 Editor Mode

- Read-only editor (`editable: false`).
- No typing commands, no toolbar.
- Selection allowed.

### 9.2 Highlight Rendering

- Use ProseMirror decorations to render ranges.
- Decorations derive from `HighlightSet` + text position map.
- No direct DOM insertion/removal of `<mark>` wrappers by manual range mutation.

### 9.3 Mapping

- Build deterministic text-position index for each block at doc init.
- Convert selection anchor/head -> block-local offsets.
- Apply domain operations on offsets; rerender decorations from new `HighlightSet`.

## 10) Interaction Rules

- Select text in one block -> `addRange`.
- Click/tap existing highlighted span -> remove only targeted span.
- Cross-block selection -> reject with policy hint.
- Zero-length or whitespace-only selection -> no-op.

## 11) Failure Modes and Safeguards

1. Storage unavailable/quota exceeded:
   - Keep in-memory state.
   - Do not block exam.
2. Corrupt stored payload:
   - Drop payload; continue clean.
3. Doc structure changes between sessions:
   - Re-validate bounds against new `blockText`.
   - Drop out-of-bound ranges.
4. Extremely large passages:
   - Keep decoration rebuild O(n log n) max with pre-sorted ranges.

## 12) Big-Bang Migration Plan

### Phase A: Foundation

- Introduce domain + infra modules + tests.
- Implement v2 storage schema and validator.

Exit criteria:

- Pure domain tests pass for add/remove/merge/split invariants.

### Phase B: Tiptap Reading Renderer

- Build read-only Tiptap reading block renderer.
- Add selection-to-offset mapper and decoration renderer.

Exit criteria:

- Student reading can render all existing block types without highlight regressions.

### Phase C: Integration

- Wire new highlight application service into student reading + preview.
- Remove old `FormattedText` highlight path for reading.

Exit criteria:

- Reading highlight behavior parity verified.

### Phase D: Cleanup

- Delete deprecated HTML highlight persistence paths for reading.
- Keep compatibility shims only if required for non-reading areas.

Exit criteria:

- No reading path references to old DOM mutation highlight code.

## 13) Test Strategy

### 13.1 Unit (Domain)

- Range normalization (adjacent merge, overlap merge, split behavior).
- Out-of-bounds rejection.
- Color enum validation.

### 13.2 Integration (Application + Infra)

- Save/restore across remount and browser-close simulation.
- Storage error handling (quota/security exception path).

### 13.3 UI/E2E

- Select small phrase: only selected phrase highlights.
- Repeat highlight on same phrase: no nesting/corruption.
- Tap highlighted phrase: only one target span removed.
- Cross-block drag: rejected and no corrupt state.

## 14) Cutover Safety Checklist

- All reading highlight tests green.
- StudentQuestionExperience tests green for reading module.
- Manual smoke:
  - desktop browser
  - iPad/touch path
  - preview + runtime

## 15) Open Risks

- ProseMirror selection mapping bugs on specific mobile Safari builds.
- Unexpected HTML constructs from builder content that need extra node mapping rules.
- Large passage performance if decoration recalculation is not memoized carefully.

## 16) Proposed File Layout

```text
src/features/student/highlight-domain/
  highlightTypes.ts
  highlightInvariants.ts
  highlightRangeOps.ts

src/features/student/highlight-application/
  highlightService.ts
  highlightPolicies.ts

src/features/student/highlight-infra/
  localHighlightStore.ts
  highlightSnapshotCodec.ts

src/features/student/highlight-ui/
  tiptapHighlightExtension.ts
  useReadingHighlightController.ts
  ReadingHighlightView.tsx
```

## 17) Acceptance Criteria

1. No persisted reading highlight HTML in v2 path.
2. No nested highlight DOM in rendered output.
3. Selection correctness: highlighted content equals selected content.
4. Highlight survives browser close/reopen for same attempt.
5. Existing color palette UX parity preserved.
