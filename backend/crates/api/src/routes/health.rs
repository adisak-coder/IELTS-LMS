use axum::{
    extract::{Extension, State},
    http::{header::CONTENT_TYPE, StatusCode},
    Json,
};
use serde::{Deserialize, Serialize};

use crate::{
    http::{
        request_id::RequestId,
        response::{self, SuccessResponse},
    },
    state::AppState,
};
use ielts_backend_infrastructure::database_monitor::{
    inspect_outbox_backlog, inspect_storage_budget, ping_database,
};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HealthData {
    status: &'static str,
    live_mode_enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ReadinessData {
    status: &'static str,
    database: &'static str,
    live_mode_enabled: bool,
}

pub async fn healthz(
    State(state): State<AppState>,
    Extension(request_id): Extension<RequestId>,
) -> Json<SuccessResponse<HealthData>> {
    response::json(
        HealthData {
            status: "ok",
            live_mode_enabled: state.live_mode_enabled,
        },
        request_id.0,
    )
}

pub async fn readyz(
    State(state): State<AppState>,
    Extension(request_id): Extension<RequestId>,
) -> Json<SuccessResponse<ReadinessData>> {
    let (database, status) = if let Some(pool) = state.db_pool_opt() {
        match ping_database(&pool).await {
            Ok(duration) => {
                state
                    .telemetry
                    .observe_db_operation("health.readyz", duration);
                ("ready", "ready")
            }
            Err(error) => {
                tracing::warn!(error = %error, "database readiness check failed");
                ("error", "degraded")
            }
        }
    } else {
        (state.pool.readiness_label(), "ready")
    };

    response::json(
        ReadinessData {
            status,
            database,
            live_mode_enabled: state.live_mode_enabled,
        },
        request_id.0,
    )
}

pub async fn metrics(
    State(state): State<AppState>,
) -> Result<([(axum::http::header::HeaderName, &'static str); 1], String), StatusCode> {
    if !state.config.prometheus_enabled {
        return Err(StatusCode::NOT_FOUND);
    }

    if let Some(resident_bytes) = process_resident_memory_bytes() {
        state
            .telemetry
            .set_process_resident_memory_bytes(resident_bytes);
    }
    let rate_limiter_buckets = state.rate_limiter.bucket_count().await;
    state
        .telemetry
        .set_rate_limiter_bucket_count(rate_limiter_buckets);

    if let Some(pool) = state.db_pool_opt() {
        if let Ok(backlog) = inspect_outbox_backlog(&pool).await {
            state
                .telemetry
                .observe_outbox_backlog(backlog.pending_count, backlog.oldest_age_seconds);
        }

        if let Ok(storage) =
            inspect_storage_budget(&pool, state.config.storage_budget_thresholds.clone()).await
        {
            state.telemetry.observe_storage_budget(
                storage.total_bytes,
                storage.level.as_label(),
                storage.level.as_severity_code(),
            );
        }
    }

    let body = state
        .telemetry
        .render()
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok((
        [(CONTENT_TYPE, "text/plain; version=0.0.4; charset=utf-8")],
        body,
    ))
}

#[cfg(target_os = "linux")]
fn process_resident_memory_bytes() -> Option<u64> {
    // Parse `VmRSS` from `/proc/self/status` (kB).
    let status = std::fs::read_to_string("/proc/self/status").ok()?;
    for line in status.lines() {
        let Some(rest) = line.strip_prefix("VmRSS:") else {
            continue;
        };
        let kb: u64 = rest.trim().split_whitespace().next()?.parse().ok()?;
        return Some(kb.saturating_mul(1024));
    }
    None
}

#[cfg(not(target_os = "linux"))]
fn process_resident_memory_bytes() -> Option<u64> {
    None
}
