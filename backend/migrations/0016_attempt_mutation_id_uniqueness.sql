-- Enforce idempotency identity per attempt regardless of client session.
-- This complements application-layer duplicate detection and stale-session guards.
CREATE UNIQUE INDEX idx_student_attempt_mutations_attempt_mutation_id
    ON student_attempt_mutations(attempt_id, client_mutation_id);
