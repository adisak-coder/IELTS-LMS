# Context

## Incident: Join Storm 502 Cascade (2026-05-08)

- Observed behavior: `502` responses hit both student live API (`/api/v1/student/sessions/:schedule_id/live`) and frontend asset bundles (`/assets/*.js`) during join storm traffic.
- Confirmed invariant: Static asset delivery and API delivery must not share the same failure domain during join storm traffic.
- Reliability implication: A single overloaded backend path must not be able to simultaneously break UI boot and live session polling.

## Overload Policy Direction (Resolved)

- Join-storm behavior must use explicit admission control for `GET /api/v1/student/sessions/:schedule_id/live`.
- Policy shape agreed:
  - bounded in-flight limits at both per-schedule and global levels,
  - no unbounded request queue,
  - short timeout budget for overloaded paths,
  - deterministic overload response (`429` + `Retry-After`) instead of cascading `502`.

## Join-Storm Mitigation Status (2026-05-08)

- Implemented backend live-session backpressure for `GET /api/v1/student/sessions/:schedule_id/live`:
  - per-schedule limiter and global limiter now reject overload with deterministic `429` payloads.
- Operational caveat:
  - frontend assets are still served by the same API process fallback, so hard failure-domain separation is not complete without deployment topology split.

## Student Runtime Integrity Policy (Resolved, Pre-Production)

- Global policy: `offline`, `heartbeat_lost`, and `device_mismatch` are log-only integrity signals in student runtime.
- Student UX: no hard blocking overlay for those three reasons; exam flow continues.
- Student UX: no student-facing dropped-mutation reconciliation banner; reconciliation evidence stays in audit history.
- Hard block retained: `storage_unavailable` remains a visible stop condition.
- Submit behavior: student submit path is completion-first; immediate local completion is allowed if submit sync fails, with best-effort background submit retry.
- Proctor/Admin visibility: reconciliation events include affected answer/task identifiers in audit payloads; answer history can render target-level reconciliation badges from signals.

## Live In-Progress Answer Visibility Policy (Resolved, 2026-05-09)

- During an active exam, only proctors can view in-progress answer snapshots.
- Graders must not access in-progress answers; grader visibility starts after submission/finalization.
- In-exam proctor visibility is intentionally delayed (target window to be defined in implementation, e.g. 15-30 seconds).
- Every in-progress answer read must be auditable (actor, role, schedule, attempt, timestamp, reason/context).
- Proctor in-progress reads must come from a dedicated delayed projection/read model, not the live student session endpoint.

## Reading Highlight Rewrite Direction (Resolved, 2026-05-09)

- Reading highlight architecture will move to a **big-bang Tiptap/ProseMirror rewrite** (read-only view + decoration-driven highlights).
- Reading highlights will no longer persist mutated HTML; persistence will use structured **block-local text ranges** with local-only restore across browser close.
- UX parity is required for existing highlight colors (`yellow`, `amber`, `green`, `blue`) and single-target remove behavior on click/tap.
