ALTER TABLE outbox_events
    ADD COLUMN IF NOT EXISTS claim_token VARCHAR(64) NULL,
    ADD COLUMN IF NOT EXISTS claimed_by VARCHAR(128) NULL,
    ADD COLUMN IF NOT EXISTS claim_expires_at TIMESTAMP NULL;

CREATE INDEX IF NOT EXISTS idx_outbox_events_claim_lease
    ON outbox_events(published_at, claim_expires_at, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_outbox_events_claim_token
    ON outbox_events(claim_token);

CREATE INDEX IF NOT EXISTS idx_student_attempts_schedule_updated_id
    ON student_attempts(schedule_id, updated_at DESC, id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_student_attempt_mutations_attempt_mutation_id
    ON student_attempt_mutations(attempt_id, client_mutation_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_student_attempt_mutations_attempt_session_mutation_id
    ON student_attempt_mutations(attempt_id, client_session_id, client_mutation_id);
