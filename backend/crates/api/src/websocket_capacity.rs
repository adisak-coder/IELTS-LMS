use std::time::Duration;

use sqlx::{mysql::MySqlQueryResult, MySqlPool, Row, Transaction};
use uuid::Uuid;

const GLOBAL_SCOPE_TYPE: &str = "global";
const GLOBAL_SCOPE_ID: &str = "global";
const SCHEDULE_SCOPE_TYPE: &str = "schedule";

pub const DEFAULT_LEASE_TTL: Duration = Duration::from_secs(90);
pub const DEFAULT_LEASE_RENEW_INTERVAL: Duration = Duration::from_secs(30);

#[derive(Debug, Clone, Copy)]
pub struct WebsocketConnectionCapacityConfig {
    pub global_capacity: u32,
    pub schedule_capacity: u32,
    pub lease_ttl: Duration,
}

impl WebsocketConnectionCapacityConfig {
    pub fn new(global_capacity: u32, schedule_capacity: u32, lease_ttl: Duration) -> Self {
        Self {
            global_capacity,
            schedule_capacity,
            lease_ttl,
        }
    }
}

#[derive(Debug, Clone)]
pub struct WebsocketConnectionLease {
    pub id: Uuid,
    pub schedule_id: Option<String>,
}

#[derive(Debug)]
pub enum WebsocketConnectionCapacityError {
    Database(sqlx::Error),
    GlobalCapacityReached,
    ScheduleCapacityReached,
}

impl From<sqlx::Error> for WebsocketConnectionCapacityError {
    fn from(value: sqlx::Error) -> Self {
        Self::Database(value)
    }
}

pub async fn acquire_websocket_connection_lease(
    pool: &MySqlPool,
    user_id: &str,
    schedule_id: Option<&str>,
    config: &WebsocketConnectionCapacityConfig,
) -> Result<WebsocketConnectionLease, WebsocketConnectionCapacityError> {
    let mut tx = pool.begin().await.map_err(WebsocketConnectionCapacityError::Database)?;
    ensure_capacity_row(&mut tx, GLOBAL_SCOPE_TYPE, GLOBAL_SCOPE_ID).await?;

    let global_capacity = i64::from(config.global_capacity);
    let global_updated = update_capacity_row(
        &mut tx,
        GLOBAL_SCOPE_TYPE,
        GLOBAL_SCOPE_ID,
        global_capacity,
    )
    .await?;
    if !global_updated {
        tx.rollback().await.ok();
        return Err(WebsocketConnectionCapacityError::GlobalCapacityReached);
    }

    if let Some(schedule_id) = schedule_id {
        ensure_capacity_row(&mut tx, SCHEDULE_SCOPE_TYPE, schedule_id).await?;
        let schedule_capacity = i64::from(config.schedule_capacity);
        let schedule_updated = update_capacity_row(
            &mut tx,
            SCHEDULE_SCOPE_TYPE,
            schedule_id,
            schedule_capacity,
        )
        .await?;
        if !schedule_updated {
            tx.rollback().await.ok();
            return Err(WebsocketConnectionCapacityError::ScheduleCapacityReached);
        }
    }

    let lease_id = Uuid::new_v4();
    let lease_ttl_secs = config.lease_ttl.as_secs() as i64;
    sqlx::query(
        r#"
        INSERT INTO websocket_connection_leases (
            id, user_id, schedule_id, expires_at, created_at, updated_at
        )
        VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND), NOW(), NOW())
        "#,
    )
    .bind(lease_id.to_string())
    .bind(user_id)
    .bind(schedule_id)
    .bind(lease_ttl_secs)
    .execute(tx.as_mut())
    .await
    .map_err(WebsocketConnectionCapacityError::Database)?;

    tx.commit().await.map_err(WebsocketConnectionCapacityError::Database)?;

    Ok(WebsocketConnectionLease {
        id: lease_id,
        schedule_id: schedule_id.map(|value| value.to_owned()),
    })
}

pub async fn release_websocket_connection_lease(
    pool: &MySqlPool,
    lease_id: Uuid,
) -> Result<(), WebsocketConnectionCapacityError> {
    let mut tx = pool.begin().await.map_err(WebsocketConnectionCapacityError::Database)?;
    let lease = sqlx::query(
        r#"
        SELECT schedule_id
        FROM websocket_connection_leases
        WHERE id = ?
        "#,
    )
    .bind(lease_id.to_string())
    .fetch_optional(tx.as_mut())
    .await
    .map_err(WebsocketConnectionCapacityError::Database)?;

    let Some(lease) = lease else {
        tx.commit().await.map_err(WebsocketConnectionCapacityError::Database)?;
        return Ok(());
    };

    let deleted = sqlx::query(
        r#"
        DELETE FROM websocket_connection_leases
        WHERE id = ?
        "#,
    )
    .bind(lease_id.to_string())
    .execute(tx.as_mut())
    .await
    .map_err(WebsocketConnectionCapacityError::Database)?
    .rows_affected();

    if deleted > 0 {
        decrement_capacity_row(&mut tx, GLOBAL_SCOPE_TYPE, GLOBAL_SCOPE_ID, 1).await?;
        let schedule_id: Option<String> = lease
            .try_get("schedule_id")
            .map_err(WebsocketConnectionCapacityError::Database)?;
        if let Some(schedule_id) = schedule_id {
            decrement_capacity_row(&mut tx, SCHEDULE_SCOPE_TYPE, &schedule_id, 1).await?;
        }
    }

    tx.commit().await.map_err(WebsocketConnectionCapacityError::Database)?;
    Ok(())
}

pub async fn renew_websocket_connection_lease(
    pool: &MySqlPool,
    lease_id: Uuid,
    lease_ttl: Duration,
) -> Result<bool, WebsocketConnectionCapacityError> {
    let lease_ttl_secs = lease_ttl.as_secs() as i64;
    let result: MySqlQueryResult = sqlx::query(
        r#"
        UPDATE websocket_connection_leases
        SET expires_at = DATE_ADD(NOW(), INTERVAL ? SECOND), updated_at = NOW()
        WHERE id = ?
        "#,
    )
    .bind(lease_ttl_secs)
    .bind(lease_id.to_string())
    .execute(pool)
    .await
    .map_err(WebsocketConnectionCapacityError::Database)?;
    Ok(result.rows_affected() > 0)
}

pub async fn cleanup_expired_websocket_connection_leases(
    pool: &MySqlPool,
) -> Result<u64, WebsocketConnectionCapacityError> {
    let mut tx = pool.begin().await.map_err(WebsocketConnectionCapacityError::Database)?;
    let expired_rows = sqlx::query(
        r#"
        SELECT DISTINCT schedule_id
        FROM websocket_connection_leases
        WHERE expires_at <= NOW()
        "#,
    )
    .fetch_all(tx.as_mut())
    .await
    .map_err(WebsocketConnectionCapacityError::Database)?;

    let mut total_deleted = 0u64;

    for row in expired_rows {
        let schedule_id: Option<String> = row
            .try_get("schedule_id")
            .map_err(WebsocketConnectionCapacityError::Database)?;

        if let Some(schedule_id) = schedule_id {
            let deleted = sqlx::query(
                r#"
                DELETE FROM websocket_connection_leases
                WHERE schedule_id = ? AND expires_at <= NOW()
                "#,
            )
            .bind(&schedule_id)
            .execute(tx.as_mut())
            .await
            .map_err(WebsocketConnectionCapacityError::Database)?
            .rows_affected();
            if deleted > 0 {
                decrement_capacity_row(&mut tx, SCHEDULE_SCOPE_TYPE, &schedule_id, deleted as i64)
                    .await?;
                total_deleted += deleted;
            }
        }
    }

    let deleted_without_schedule = sqlx::query(
        r#"
        DELETE FROM websocket_connection_leases
        WHERE schedule_id IS NULL AND expires_at <= NOW()
        "#,
    )
    .execute(tx.as_mut())
    .await
    .map_err(WebsocketConnectionCapacityError::Database)?
    .rows_affected();

    if deleted_without_schedule > 0 {
        total_deleted += deleted_without_schedule;
    }

    if total_deleted > 0 {
        decrement_capacity_row(&mut tx, GLOBAL_SCOPE_TYPE, GLOBAL_SCOPE_ID, total_deleted as i64)
            .await?;
    }

    tx.commit().await.map_err(WebsocketConnectionCapacityError::Database)?;
    Ok(total_deleted)
}

async fn ensure_capacity_row(
    executor: &mut Transaction<'_, sqlx::MySql>,
    scope_type: &str,
    scope_id: &str,
) -> Result<(), WebsocketConnectionCapacityError> {
    sqlx::query(
        r#"
        INSERT INTO websocket_connection_capacity (scope_type, scope_id, active_count, updated_at)
        VALUES (?, ?, 0, NOW())
        ON DUPLICATE KEY UPDATE scope_id = VALUES(scope_id)
        "#,
    )
    .bind(scope_type)
    .bind(scope_id)
    .execute(executor.as_mut())
    .await
    .map_err(WebsocketConnectionCapacityError::Database)?;
    Ok(())
}

async fn update_capacity_row(
    executor: &mut Transaction<'_, sqlx::MySql>,
    scope_type: &str,
    scope_id: &str,
    limit: i64,
) -> Result<bool, WebsocketConnectionCapacityError> {
    let result = sqlx::query(
        r#"
        UPDATE websocket_connection_capacity
        SET active_count = active_count + 1, updated_at = NOW()
        WHERE scope_type = ? AND scope_id = ? AND active_count < ?
        "#,
    )
    .bind(scope_type)
    .bind(scope_id)
    .bind(limit)
    .execute(executor.as_mut())
    .await
    .map_err(WebsocketConnectionCapacityError::Database)?;
    Ok(result.rows_affected() > 0)
}

async fn decrement_capacity_row(
    executor: &mut Transaction<'_, sqlx::MySql>,
    scope_type: &str,
    scope_id: &str,
    amount: i64,
) -> Result<(), WebsocketConnectionCapacityError> {
    if amount <= 0 {
        return Ok(());
    }

    sqlx::query(
        r#"
        UPDATE websocket_connection_capacity
        SET active_count = GREATEST(active_count - ?, 0), updated_at = NOW()
        WHERE scope_type = ? AND scope_id = ?
        "#,
    )
    .bind(amount)
    .bind(scope_type)
    .bind(scope_id)
    .execute(executor.as_mut())
    .await
    .map_err(WebsocketConnectionCapacityError::Database)?;
    Ok(())
}
