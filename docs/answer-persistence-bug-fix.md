# Answer Persistence Bug Fix - Technical Documentation

## Issue Summary

**Critical Bug**: User answers were not being saved to the database in high-scale user scenarios.

**Root Cause**: The `UPDATE student_attempts` query was not verifying that the update actually affected any rows, and there was insufficient error logging to detect when mutations failed to persist.

## Root Cause Analysis

### Investigation Findings

1. **Mutation Flow**: Answers flow through `apply_mutation_batch()` in `delivery.rs`:
   - Mutations are validated against `AnswerConstraint`
   - Section membership is enforced via `enforce_section_membership()`
   - Objective gate must be open for mutations to be accepted
   - Mutations are persisted to `student_attempt_mutations` table
   - Attempt row is updated via `UPDATE student_attempts`

2. **Critical Gap**: The `UPDATE student_attempts` query did NOT verify `rows_affected()`:
   ```rust
   // BEFORE (vulnerable):
   sqlx::query("UPDATE student_attempts SET ... WHERE id = ?")
       .bind(&req.attempt_id)
       .execute(tx.as_mut())
       .await?;
   ```

3. **Silent Failures**: If the UPDATE failed silently (e.g., due to constraint violations, deadlocks, or connection issues), the transaction would commit without persisting the updated answers.

## Solution Implemented

### 1. Enhanced UPDATE Verification

Added explicit verification that `UPDATE` affects exactly 1 row:

```rust
let update_result = sqlx::query("UPDATE student_attempts SET ... WHERE id = ?")
    .bind(&req.attempt_id)
    .execute(tx.as_mut())
    .await?;

if update_result.rows_affected() != 1 {
    tracing::error!(
        schedule_id = %schedule_id,
        attempt_id = %req.attempt_id,
        rows_affected = update_result.rows_affected(),
        "CRITICAL: student_attempts UPDATE did not affect exactly 1 row",
    );
    return Err(DeliveryError::Internal(
        "Failed to update attempt row"
    ));
}
```

**Files Modified**:
- `backend/crates/application/src/delivery.rs`
  - Standard mutation path (line ~1026)
  - Operation mode path (line ~813)

### 2. Comprehensive Error Logging

Enhanced logging for mutation application failures:

```rust
if let Err(error) = apply_mutation(...) {
    tracing::error!(
        schedule_id = %schedule_id,
        attempt_id = %req.attempt_id,
        client_session_id = %req.client_session_id,
        mutation_index = index,
        mutation_id = %mutation.id,
        mutation_type = %mutation.mutation_type,
        mutation_seq = mutation.seq,
        error = %error,
        "failed to apply mutation - answer may not be persisted",
    );
    return Err(error);
}
```

### 3. Performance Instrumentation

Added timing metrics for mutation persistence:

```rust
tracing::debug!(
    mutations_count = req.mutations.len(),
    mutation_apply_duration_ms = (Utc::now() - mutation_apply_start).num_milliseconds(),
    "applied mutations to in-memory state",
);

tracing::info!(
    mutation_batch_count = req.mutations.len(),
    persisted_mutations_count,
    persistence_duration_ms = (Utc::now() - persistence_start).num_milliseconds(),
    "persisted student mutation batch",
);
```

## Monitoring Requirements

### Key Log Signals to Monitor

1. **CRITICAL Log Messages**:
   ```
   "CRITICAL: student_attempts UPDATE did not affect exactly 1 row"
   "CRITICAL: student_attempts UPDATE in operation mode did not affect exactly 1 row"
   ```
   **Action**: Immediate investigation required

2. **ERROR Log Messages**:
   ```
   "failed to apply mutation - answer may not be persisted"
   "student mutation batch failed with non-retryable or exhausted database error"
   ```
   **Action**: Review within 1 hour

3. **WARN Log Messages**:
   ```
   "retrying student mutation batch after transient database failure"
   ```
   **Action**: Monitor for patterns, investigate if frequent

### Metrics to Track

1. **Mutation Persistence Latency** (`persistence_duration_ms`)
   - Alert threshold: > 500ms p95
   - Critical threshold: > 1000ms p99

2. **Mutation Failure Rate**
   - Alert threshold: > 0.1% failure rate
   - Critical threshold: > 1% failure rate

3. **Answer Update Row Count**
   - Monitor `rows_affected != 1` events
   - Any occurrence is a critical alert

### Dashboard Queries

```sql
-- Mutation persistence failures
SELECT COUNT(*), DATE(created_at) as date
FROM session_audit_logs
WHERE action_type = 'STUDENT_MUTATION_BATCH'
  AND JSON_EXTRACT(payload, '$.persistedMutationCount') < JSON_EXTRACT(payload, '$.count')
GROUP BY DATE(created_at);

-- Answer update failures
SELECT * FROM application_logs
WHERE message LIKE '%did not affect exactly 1 row%'
ORDER BY created_at DESC;
```

## Prevention Measures

1. **Testing**: Unit tests verify `ensure_mutation_persistence_invariant()` behavior
2. **Idempotency**: Client-side idempotency keys prevent duplicate submissions
3. **Sequence Validation**: `validate_contiguous_sequences()` prevents out-of-order mutations
4. **Row Locking**: `SELECT ... FOR UPDATE` prevents race conditions

## Rollout Recommendations

1. **Stage 1**: Deploy to staging environment
2. **Stage 2**: Run load tests with 10x normal traffic
3. **Stage 3**: Monitor for 24 hours in staging
4. **Stage 4**: Progressive rollout to production (10% → 50% → 100%)
5. **Stage 5**: Continue monitoring for 1 week post-deployment

## Related Files

- `backend/crates/application/src/delivery.rs` - Main mutation processing logic
- `backend/migrations/0006_delivery.sql` - Database schema
- `backend/migrations/0016_attempt_mutation_id_uniqueness.sql` - Idempotency constraints
- `backend/migrations/0017_production_hardening.sql` - Production indexes
- `docs/student-mutation-process-l7.md` - Mutation flow documentation