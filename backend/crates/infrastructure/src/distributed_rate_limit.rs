use chrono::{DateTime, Duration, TimeZone, Utc};
use sqlx::MySqlPool;

use crate::rate_limit::{RateLimitConfig, RateLimitKey, RateLimitResult};

#[derive(Clone, Debug)]
pub struct DistributedRateLimiter {
    pool: MySqlPool,
}

impl DistributedRateLimiter {
    pub fn new(pool: MySqlPool) -> Self {
        Self { pool }
    }

    pub async fn check_with_config(
        &self,
        route_key: &str,
        key: &RateLimitKey,
        config: &RateLimitConfig,
    ) -> Result<RateLimitResult, sqlx::Error> {
        let capacity = config.max_requests.saturating_add(config.burst).max(1);
        let window_secs = config.window.as_secs().max(1);
        let now = Utc::now();
        let window_start = floor_window(now, window_secs);
        let expires_at = window_start + Duration::seconds((window_secs.saturating_mul(2)) as i64);
        let bucket_key = normalize_key(key);

        sqlx::query(
            r#"
            INSERT INTO distributed_rate_limit_counters (
                route_key, bucket_key, window_start, request_count, expires_at, updated_at
            )
            VALUES (?, ?, ?, 1, ?, NOW())
            ON DUPLICATE KEY UPDATE
                request_count = request_count + 1,
                expires_at = VALUES(expires_at),
                updated_at = NOW()
            "#,
        )
        .bind(route_key)
        .bind(&bucket_key)
        .bind(window_start)
        .bind(expires_at)
        .execute(&self.pool)
        .await?;

        let request_count: i64 = sqlx::query_scalar(
            r#"
            SELECT request_count
            FROM distributed_rate_limit_counters
            WHERE route_key = ?
              AND bucket_key = ?
              AND window_start = ?
            "#,
        )
        .bind(route_key)
        .bind(&bucket_key)
        .bind(window_start)
        .fetch_one(&self.pool)
        .await?;

        let window_end = window_start + Duration::seconds(window_secs as i64);
        let retry_after = window_end
            .signed_duration_since(now)
            .to_std()
            .unwrap_or_default();

        if request_count > i64::from(capacity) {
            return Ok(RateLimitResult::Denied { retry_after });
        }

        let remaining = (i64::from(capacity) - request_count).max(0) as u32;
        Ok(RateLimitResult::Allowed {
            remaining,
            reset_after: retry_after,
        })
    }

    pub async fn purge_expired(&self, limit: i64) -> Result<u64, sqlx::Error> {
        let result = sqlx::query(
            r#"
            DELETE FROM distributed_rate_limit_counters
            WHERE expires_at < NOW()
            ORDER BY expires_at ASC
            LIMIT ?
            "#,
        )
        .bind(limit.max(1))
        .execute(&self.pool)
        .await?;
        Ok(result.rows_affected())
    }
}

fn floor_window(now: DateTime<Utc>, window_secs: u64) -> DateTime<Utc> {
    let window_secs = window_secs.max(1);
    let bucket = (now.timestamp().max(0) as u64 / window_secs) * window_secs;
    Utc.timestamp_opt(bucket as i64, 0).single().unwrap_or(now)
}

fn normalize_key(key: &RateLimitKey) -> String {
    match key {
        RateLimitKey::Ip(ip) => format!("ip:{ip}"),
        RateLimitKey::User(user) => format!("user:{user}"),
        RateLimitKey::Attempt(attempt) => format!("attempt:{attempt}"),
        RateLimitKey::Custom(value) => format!("custom:{value}"),
    }
}
