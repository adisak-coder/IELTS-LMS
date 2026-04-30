CREATE TABLE IF NOT EXISTS student_attempt_answer_slots (
    attempt_id VARCHAR(36) NOT NULL,
    question_id VARCHAR(255) NOT NULL,
    slot_index INT NOT NULL,
    value_text TEXT NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (attempt_id, question_id, slot_index),
    CONSTRAINT student_attempt_answer_slots_attempt_fk
        FOREIGN KEY (attempt_id) REFERENCES student_attempts(id) ON DELETE CASCADE
);

CREATE INDEX idx_student_attempt_answer_slots_attempt_question
    ON student_attempt_answer_slots(attempt_id, question_id, slot_index);

CREATE UNIQUE INDEX idx_student_attempt_mutations_attempt_session_mutation_id
    ON student_attempt_mutations(attempt_id, client_session_id, client_mutation_id);
