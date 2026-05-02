use std::time::Instant;

use ielts_backend_infrastructure::{
    config::AppConfig,
    database_monitor::StorageBudgetLevel,
    distributed_rate_limit::DistributedRateLimiter,
    idempotency::IdempotencyRepository,
    live_update_bus::LiveUpdateBusRepository,
    outbox::OutboxRepository,
};
use sqlx::MySqlPool;

#[derive(Debug, Clone, Copy, Default)]
pub struct RetentionRunReport {
    pub cache_rows: u64,
    pub idempotency_rows: u64,
    pub user_sessions_rows: u64,
    pub heartbeat_rows: u64,
    pub mutation_rows: u64,
    pub outbox_rows: u64,
    pub distributed_rate_limit_rows: u64,
    pub live_update_rows: u64,
    pub duration_ms: u64,
}

impl RetentionRunReport {
    pub fn total_rows(self) -> u64 {
        self.cache_rows
            + self.idempotency_rows
            + self.user_sessions_rows
            + self.heartbeat_rows
            + self.mutation_rows
            + self.outbox_rows
            + self.distributed_rate_limit_rows
            + self.live_update_rows
    }
}

#[tracing::instrument(skip(pool))]
pub async fn run_once(pool: MySqlPool) -> Result<RetentionRunReport, sqlx::Error> {
    run_once_with_config(pool, &AppConfig::default()).await
}

#[tracing::instrument(skip(pool, config))]
pub async fn run_once_with_config(
    pool: MySqlPool,
    config: &AppConfig,
) -> Result<RetentionRunReport, sqlx::Error> {
    run_once_with_config_and_budget(pool, config, StorageBudgetLevel::Normal).await
}

#[tracing::instrument(skip(pool, config))]
pub async fn run_once_with_config_and_budget(
    pool: MySqlPool,
    config: &AppConfig,
    storage_budget_level: StorageBudgetLevel,
) -> Result<RetentionRunReport, sqlx::Error> {
    let started = Instant::now();
    let idempotency = IdempotencyRepository::new(pool.clone());
    let outbox = OutboxRepository::new(pool.clone());
    let distributed_rate_limit = DistributedRateLimiter::new(pool.clone());
    let live_update_bus = LiveUpdateBusRepository::new(pool.clone());
    let cleanup_batch_limit = cleanup_batch_limit(config, storage_budget_level);
    let cache_grace_hours = cache_grace_hours(config, storage_budget_level);

    let cache_rows = sqlx::query(
        r#"
        DELETE FROM shared_cache_entries
        WHERE cache_key IN (
            SELECT cache_key
            FROM (
                SELECT cache_key
                FROM shared_cache_entries
                WHERE (invalidated_at IS NOT NULL AND invalidated_at < DATE_SUB(NOW(), INTERVAL ? HOUR))
                   OR (expires_at IS NOT NULL AND expires_at < DATE_SUB(NOW(), INTERVAL ? HOUR))
                ORDER BY COALESCE(invalidated_at, expires_at) ASC
                LIMIT ?
            ) AS cache_keys_to_delete
        )
        "#,
    )
    .bind(cache_grace_hours)
    .bind(cache_grace_hours)
    .bind(cleanup_batch_limit)
    .execute(&pool)
    .await?
    .rows_affected();
    let idempotency_rows = idempotency
        .purge_expired_with_grace_hours(
            cleanup_batch_limit,
            config.retention_idempotency_grace_hours,
        )
        .await?;
    let user_sessions_rows = sqlx::query(
        r#"
        DELETE FROM user_sessions
        WHERE last_seen_at < DATE_SUB(NOW(), INTERVAL ? DAY)
          AND (
              revoked_at IS NOT NULL
              OR expires_at < NOW()
              OR idle_timeout_at < NOW()
          )
        ORDER BY last_seen_at ASC
        LIMIT ?
        "#,
    )
    .bind(config.retention_user_session_days.max(0))
    .bind(cleanup_batch_limit)
    .execute(&pool)
    .await?
    .rows_affected();
    let heartbeat_rows = sqlx::query(
        r#"
        DELETE FROM student_heartbeat_events
        WHERE server_received_at < DATE_SUB(NOW(), INTERVAL ? DAY)
          AND schedule_id IN (
              SELECT id
              FROM exam_schedules
              WHERE status <> 'live'
          )
        ORDER BY server_received_at ASC
        LIMIT ?
        "#,
    )
    .bind(config.retention_heartbeat_days.max(0))
    .bind(cleanup_batch_limit)
    .execute(&pool)
    .await?
    .rows_affected();
    let retention_mutation_days = config.retention_mutation_days.max(0);
    let mutation_rows = match sqlx::query(
        r#"
        DELETE FROM student_attempt_mutations
        WHERE server_received_at < DATE_SUB(NOW(), INTERVAL ? DAY)
          AND (applied_at IS NULL OR applied_at < DATE_SUB(NOW(), INTERVAL ? DAY))
          AND (
              EXISTS (
                  SELECT 1
                  FROM student_attempts
                  WHERE id = student_attempt_mutations.attempt_id
                    AND submitted_at IS NOT NULL
              )
              OR EXISTS (
                  SELECT 1
                  FROM exam_schedules
                  WHERE id = student_attempt_mutations.schedule_id
                    AND status IN ('completed', 'cancelled')
              )
          )
        LIMIT ?
        "#,
    )
    .bind(retention_mutation_days)
    .bind(retention_mutation_days)
    .bind(cleanup_batch_limit)
    .execute(&pool)
    .await
    {
        Ok(result) => result.rows_affected(),
        Err(error) if is_transient_cleanup_error(&error) => {
            tracing::warn!(
                error = %error,
                "skipping mutation retention batch due transient lock contention"
            );
            0
        }
        Err(error) => return Err(error),
    };
    let outbox_rows = outbox.purge_published(cleanup_batch_limit).await?;
    let distributed_rate_limit_rows = match distributed_rate_limit
        .purge_expired(cleanup_batch_limit)
        .await
    {
        Ok(rows) => rows,
        Err(error) if is_missing_table_error(&error) => {
            tracing::warn!(error = %error, "distributed_rate_limit_counters table missing; skipping retention");
            0
        }
        Err(error) => return Err(error),
    };
    let live_update_rows = match live_update_bus
        .purge_older_than_hours(72, cleanup_batch_limit)
        .await
    {
        Ok(rows) => rows,
        Err(error) if is_missing_table_error(&error) => {
            tracing::warn!(error = %error, "live_update_events table missing; skipping retention");
            0
        }
        Err(error) => return Err(error),
    };

    Ok(RetentionRunReport {
        cache_rows,
        idempotency_rows,
        user_sessions_rows,
        heartbeat_rows,
        mutation_rows,
        outbox_rows,
        distributed_rate_limit_rows,
        live_update_rows,
        duration_ms: started.elapsed().as_millis() as u64,
    })
}

fn cleanup_batch_limit(config: &AppConfig, storage_budget_level: StorageBudgetLevel) -> i64 {
    let base = config.retention_cleanup_batch_limit.max(1);
    match storage_budget_level {
        StorageBudgetLevel::Normal | StorageBudgetLevel::Warning => base,
        StorageBudgetLevel::HighWater => base.saturating_mul(2),
        StorageBudgetLevel::Critical => base.saturating_mul(5),
    }
}

fn cache_grace_hours(config: &AppConfig, storage_budget_level: StorageBudgetLevel) -> i64 {
    match storage_budget_level {
        StorageBudgetLevel::Normal => config.retention_shared_cache_grace_hours.max(0),
        StorageBudgetLevel::Warning => config.retention_shared_cache_grace_hours.min(1).max(0),
        StorageBudgetLevel::HighWater | StorageBudgetLevel::Critical => 0,
    }
}

fn is_transient_cleanup_error(error: &sqlx::Error) -> bool {
    match error {
        sqlx::Error::Database(db_error) => {
            matches!(db_error.code().as_deref(), Some("1205" | "1213"))
        }
        _ => false,
    }
}

fn is_missing_table_error(error: &sqlx::Error) -> bool {
    match error {
        sqlx::Error::Database(db_error) => matches!(db_error.code().as_deref(), Some("1146")),
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn high_storage_pressure_increases_cleanup_batch_limit() {
        let config = AppConfig {
            retention_cleanup_batch_limit: 100,
            ..AppConfig::default()
        };

        assert_eq!(
            cleanup_batch_limit(&config, StorageBudgetLevel::Normal),
            100
        );
        assert_eq!(
            cleanup_batch_limit(&config, StorageBudgetLevel::HighWater),
            200
        );
        assert_eq!(
            cleanup_batch_limit(&config, StorageBudgetLevel::Critical),
            500
        );
    }

    #[test]
    fn high_storage_pressure_drops_cache_grace_to_zero() {
        let config = AppConfig {
            retention_shared_cache_grace_hours: 24,
            ..AppConfig::default()
        };

        assert_eq!(cache_grace_hours(&config, StorageBudgetLevel::Normal), 24);
        assert_eq!(cache_grace_hours(&config, StorageBudgetLevel::Warning), 1);
        assert_eq!(cache_grace_hours(&config, StorageBudgetLevel::HighWater), 0);
        assert_eq!(cache_grace_hours(&config, StorageBudgetLevel::Critical), 0);
    }
}
