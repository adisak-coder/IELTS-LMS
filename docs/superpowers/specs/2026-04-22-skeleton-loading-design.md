# Skeleton Loading System (Pulse-Only)

Date: 2026-04-22

## Goal

Replace all loading affordances (spinners, “Loading…” placeholders, and progress-only shells) with a consistent skeleton-loading language across Admin, Builder, Proctor, and Student surfaces.

## UX Principles

- **Calm over flashy:** use **pulse-only** skeletons (no shimmer) to avoid motion-noise in exam/proctoring contexts.
- **Match layout:** skeletons should approximate the final UI’s structure (headers, rows, buttons) to minimize layout shift.
- **Accessibility-first:** loading regions should set `aria-busy="true"` and provide a screen-reader status message (SR-only) without relying on motion for meaning.
- **Reduced motion:** rely on existing `prefers-reduced-motion` CSS to effectively disable skeleton animation.

## Loading Patterns

### 1) Full page / route loading

- Use the existing `AppLoadingSkeleton` as the standard route-level fallback.
- Keep optional labels short and secondary (helper text, not primary content).

### 2) Section/panel loading

- Use `SectionLoadingSkeleton` for pane-level fetch states (detail panels, modals, settings sections).

### 3) Tables/lists

- Replace “Loading…” text-only placeholders with `TableLoadingSkeleton` (row blocks).
- Prefer keeping table headers visible where possible (structure anchors attention).

### 4) Card grids (libraries)

- Replace “Loading questions/passages…” empty-state shells with a grid/list skeleton that matches the final card density.

### 5) Inline/action loading (buttons, icon actions, confirm modals, toasts)

- Remove all spinners (`Loader2`, `animate-spin`).
- For primary actions:
  - Keep label text stable (avoid width jitter).
  - Disable interaction.
  - Add a small inline skeleton mark (dot/bar) that preserves button height.
- For icon-only actions:
  - Swap icon with a same-size skeleton circle.
- For toasts:
  - Replace spinner icon with a compact skeleton mark.

## Success Criteria

- No `animate-spin` remains in UI surfaces.
- No text-only loading shells remain where a skeleton can represent structure.
- Loading feels consistent across Admin/Builder/Proctor/Student, with minimal layout shift.

