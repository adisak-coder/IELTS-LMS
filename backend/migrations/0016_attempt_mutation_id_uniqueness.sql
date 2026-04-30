-- Enforce idempotency identity per attempt regardless of client session.
-- This complements application-layer duplicate detection and stale-session guards.
SET @dup_attempt_mutation_count := (
    SELECT COUNT(*)
    FROM (
        SELECT 1
        FROM student_attempt_mutations
        GROUP BY attempt_id, client_mutation_id
        HAVING COUNT(*) > 1
    ) duplicate_groups
);

SET @idx_attempt_mut_exists := (
    SELECT COUNT(*)
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'student_attempt_mutations'
      AND index_name = 'idx_student_attempt_mutations_attempt_mutation_id'
);
SET @idx_attempt_mut_sql := IF(
    @idx_attempt_mut_exists = 0 AND @dup_attempt_mutation_count = 0,
    'CREATE UNIQUE INDEX idx_student_attempt_mutations_attempt_mutation_id ON student_attempt_mutations(attempt_id, client_mutation_id)',
    'SELECT 1'
);
PREPARE idx_attempt_mut_stmt FROM @idx_attempt_mut_sql;
EXECUTE idx_attempt_mut_stmt;
DEALLOCATE PREPARE idx_attempt_mut_stmt;
