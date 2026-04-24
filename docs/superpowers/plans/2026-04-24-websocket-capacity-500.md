# Websocket Capacity 500 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make live websocket capacity work for 500 simultaneous connections on a single backend and across multiple backend replicas.

**Architecture:** Replace the in-memory websocket capacity checks with MySQL-backed connection leases and counters. The websocket route acquires a lease before upgrade, renews it while the socket is alive, and releases it on disconnect. A background cleanup job reclaims expired leases so crashed replicas do not permanently consume capacity.

**Tech Stack:** Rust, Axum, SQLx, MySQL, Tokio

---

### Task 1: Add shared websocket lease storage

**Files:**
- Create: `backend/migrations/0012_websocket_connection_leases.sql`
- Modify: `backend/crates/infrastructure/src/config.rs`

- [ ] **Step 1: Write the failing test**

Add a test that expects the new default websocket caps to be `500` so the configuration change is locked in.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cargo test -p ielts-backend-infrastructure default_caps`
Expected: fail because the websocket caps are still `200` and `100`.

- [ ] **Step 3: Write minimal implementation**

Update the default config values to:

```rust
websocket_connection_cap: 500,
websocket_connections_per_schedule_cap: 500,
```

Add the migration tables needed to track live connection leases and counts.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cargo test -p ielts-backend-infrastructure default_caps`
Expected: pass.

### Task 2: Enforce capacity through MySQL leases

**Files:**
- Create: `backend/crates/api/src/websocket_capacity.rs`
- Modify: `backend/crates/api/src/routes/ws.rs`
- Modify: `backend/crates/api/src/lib.rs`

- [ ] **Step 1: Write the failing test**

Add a websocket contract test that opens one connection with the cap set to `1`, then verifies the second connection is rejected until the first one closes.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cargo test -p ielts-backend-api websocket_live_endpoint_capacity`
Expected: fail because the route still uses in-memory caps.

- [ ] **Step 3: Write minimal implementation**

Implement lease acquire/release/renew helpers backed by MySQL, call them from the websocket route before upgrade, and start a cleanup loop in `run()`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cargo test -p ielts-backend-api websocket_live_endpoint_capacity`
Expected: pass.

### Task 3: Update coverage and docs

**Files:**
- Modify: `backend/tests/contracts/proctor_contract.rs`
- Modify: `context.md`

- [ ] **Step 1: Write the failing test**

Extend the proctor websocket coverage to assert the 500-cap behavior and that the connection is released after disconnect.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cargo test -p ielts-backend-api --test proctor_contract websocket_live_endpoint_capacity`
Expected: fail before the implementation is in place.

- [ ] **Step 3: Write minimal implementation**

Add the new migration to the contract test migration lists and update the documented websocket capacity numbers.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cargo test -p ielts-backend-api --test proctor_contract websocket_live_endpoint_capacity`
Expected: pass.
