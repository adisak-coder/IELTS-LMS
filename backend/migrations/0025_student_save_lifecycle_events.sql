CREATE TABLE IF NOT EXISTS student_save_lifecycle_events (
    id CHAR(36) PRIMARY KEY,
    schedule_id CHAR(36) NOT NULL,
    attempt_id CHAR(36) NOT NULL,
    stage VARCHAR(32) NOT NULL,
    status VARCHAR(32) NOT NULL,
    cycle_id VARCHAR(80) NULL,
    requested_mutation_count INT NULL,
    applied_mutation_count INT NULL,
    server_accepted_through_seq BIGINT NULL,
    duration_ms BIGINT NULL,
    error_message TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_student_save_lifecycle_schedule_created
    ON student_save_lifecycle_events(schedule_id, created_at DESC);

CREATE INDEX idx_student_save_lifecycle_attempt_created
    ON student_save_lifecycle_events(attempt_id, created_at DESC);

