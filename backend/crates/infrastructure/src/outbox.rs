use chrono::{DateTime, Utc};
use serde_json::Value;
use sqlx::{MySql, MySqlPool, Transaction};
use uuid::{fmt::Hyphenated, Uuid};

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct OutboxEvent {
    pub id: Hyphenated,
    pub aggregate_kind: String,
    pub aggregate_id: String,
    pub revision: i64,
    pub event_family: String,
    pub payload: Value,
    pub created_at: DateTime<Utc>,
    pub claimed_at: Option<DateTime<Utc>>,
    pub published_at: Option<DateTime<Utc>>,
    pub publish_attempts: i32,
    pub last_error: Option<String>,
    pub claim_token: Option<String>,
    pub claimed_by: Option<String>,
    pub claim_expires_at: Option<DateTime<Utc>>,
}

#[derive(Clone)]
pub struct OutboxRepository {
    pool: MySqlPool,
}

impl OutboxRepository {
    pub fn new(pool: MySqlPool) -> Self {
        Self { pool }
    }

    pub async fn enqueue(
        &self,
        aggregate_kind: &str,
        aggregate_id: &str,
        revision: i64,
        event_family: &str,
        payload: &Value,
    ) -> Result<OutboxEvent, sqlx::Error> {
        let id = Uuid::new_v4().hyphenated();
        sqlx::query(
            r#"
            INSERT INTO outbox_events (
                id, aggregate_kind, aggregate_id, revision, event_family, payload,
                created_at, publish_attempts
            )
            VALUES (?, ?, ?, ?, ?, ?, NOW(), 0)
            "#,
        )
        .bind(id)
        .bind(aggregate_kind)
        .bind(aggregate_id)
        .bind(revision)
        .bind(event_family)
        .bind(payload)
        .execute(&self.pool)
        .await?;

        self.fetch_one(id).await
    }

    pub async fn enqueue_in_tx(
        tx: &mut Transaction<'_, MySql>,
        aggregate_kind: &str,
        aggregate_id: &str,
        revision: i64,
        event_family: &str,
        payload: &Value,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            INSERT INTO outbox_events (
                id, aggregate_kind, aggregate_id, revision, event_family, payload,
                created_at, publish_attempts
            )
            VALUES (?, ?, ?, ?, ?, ?, NOW(), 0)
            "#,
        )
        .bind(Uuid::new_v4().hyphenated())
        .bind(aggregate_kind)
        .bind(aggregate_id)
        .bind(revision)
        .bind(event_family)
        .bind(payload)
        .execute(&mut **tx)
        .await?;

        Ok(())
    }

    pub async fn claim_batch(
        &self,
        limit: i64,
        worker_id: &str,
        lease_seconds: i64,
    ) -> Result<Vec<OutboxEvent>, sqlx::Error> {
        let mut tx = self.pool.begin().await?;
        let claim_token = Uuid::new_v4().to_string();
        let claim_result = sqlx::query(
            r#"
            UPDATE outbox_events
            SET
                claimed_at = NOW(),
                claim_expires_at = DATE_ADD(NOW(), INTERVAL ? SECOND),
                claimed_by = ?,
                claim_token = ?,
                publish_attempts = publish_attempts + 1
            WHERE published_at IS NULL
              AND (claimed_at IS NULL OR claim_expires_at < NOW())
            ORDER BY created_at ASC
            LIMIT ?
            "#,
        )
        .bind(lease_seconds.max(1))
        .bind(worker_id)
        .bind(&claim_token)
        .bind(limit)
        .execute(&mut *tx)
        .await?;

        if claim_result.rows_affected() == 0 {
            tx.commit().await?;
            return Ok(Vec::new());
        }

        let events = sqlx::query_as::<_, OutboxEvent>(
            "SELECT * FROM outbox_events WHERE claim_token = ? AND published_at IS NULL ORDER BY created_at ASC",
        )
        .bind(&claim_token)
        .fetch_all(&mut *tx)
        .await?;
        tx.commit().await?;
        Ok(events)
    }

    pub async fn mark_published(
        &self,
        claim_token: &str,
        ids: &[Hyphenated],
    ) -> Result<u64, sqlx::Error> {
        if ids.is_empty() {
            return Ok(0);
        }

        let placeholders = std::iter::repeat("?")
            .take(ids.len())
            .collect::<Vec<_>>()
            .join(", ");
        let sql = format!(
            "UPDATE outbox_events SET published_at = NOW(), last_error = NULL, claim_token = NULL, claimed_by = NULL, claim_expires_at = NULL WHERE claim_token = ? AND id IN ({placeholders})"
        );
        let mut query = sqlx::query(&sql).bind(claim_token);
        for id in ids {
            query = query.bind(*id);
        }
        let result = query.execute(&self.pool).await?;

        Ok(result.rows_affected())
    }

    pub async fn notify_published(
        &self,
        events: &[OutboxEvent],
        _channel: &str,
    ) -> Result<u64, sqlx::Error> {
        // Note: pg_notify is PostgreSQL-specific
        // Real-time notifications will be handled by application-level polling or Redis pub/sub
        if events.is_empty() {
            return Ok(0);
        }

        Ok(events.len() as u64)
    }

    pub async fn mark_failed(
        &self,
        claim_token: &str,
        id: Hyphenated,
        message: &str,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE outbox_events SET claimed_at = NULL, claim_token = NULL, claimed_by = NULL, claim_expires_at = NULL, last_error = ? WHERE id = ? AND claim_token = ?",
        )
            .bind(message)
            .bind(id)
            .bind(claim_token)
            .execute(&self.pool)
            .await?;

        Ok(())
    }

    pub async fn purge_published(&self, limit: i64) -> Result<u64, sqlx::Error> {
        let result = sqlx::query(
            r#"
            DELETE FROM outbox_events
            WHERE published_at < DATE_SUB(NOW(), INTERVAL 72 HOUR)
            ORDER BY published_at ASC
            LIMIT ?
            "#,
        )
        .bind(limit)
        .execute(&self.pool)
        .await?;

        Ok(result.rows_affected())
    }

    async fn fetch_one(&self, id: Hyphenated) -> Result<OutboxEvent, sqlx::Error> {
        sqlx::query_as::<_, OutboxEvent>("SELECT * FROM outbox_events WHERE id = ?")
            .bind(id)
            .fetch_one(&self.pool)
            .await
    }
}
