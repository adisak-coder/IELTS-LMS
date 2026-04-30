use axum::{
    extract::{Extension, Path, Query, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use chrono::Utc;
use ielts_backend_application::auth::{AuthService, StudentAccess};
use ielts_backend_application::delivery::{
    DeliveryError, DeliveryService, MutationBatchResponseMode,
};
use ielts_backend_domain::attempt::{
    MutationEnvelope, StudentAuditLogRequest, StudentBootstrapRequest, StudentHeartbeatRequest,
    StudentHeartbeatResponse, StudentLiveSessionContext, StudentMutationBatchRequest,
    StudentMutationBatchResponse, StudentPrecheckRequest, StudentSessionContext,
    StudentSessionQuery, StudentStaticSessionContext, StudentSubmitRequest, StudentSubmitResponse,
};
use ielts_backend_domain::auth::UserRole;
use serde_json::{json, Value};
use sqlx::query_scalar;
use std::time::Instant;
use uuid::Uuid;

use ielts_backend_infrastructure::rate_limit::{RateLimitConfig, RateLimitKey, RateLimitResult};

use crate::{
    http::{
        auth::{AttemptPrincipal, AuthenticatedUser, VerifiedCsrf},
        request_id::RequestId,
        response::{ApiError, ApiResponse},
    },
    state::AppState,
};

fn delivery_service(state: &AppState) -> DeliveryService {
    DeliveryService::with_idempotency_usable_hours(
        state.db_pool(),
        state.config.retention_idempotency_usable_hours,
    )
}

pub async fn get_student_session(
    State(state): State<AppState>,
    Extension(request_id): Extension<RequestId>,
    principal: AuthenticatedUser,
    Path(schedule_id): Path<Uuid>,
    Query(query): Query<StudentSessionQuery>,
) -> Result<ApiResponse<StudentSessionContext>, ApiError> {
    principal.require_one_of(&[
        UserRole::Student,
        UserRole::Admin,
        UserRole::Builder,
        UserRole::Proctor,
    ])?;
    let access = authorize_student(&state, &principal, schedule_id).await?;
    let service = delivery_service(&state);
    let started = Instant::now();

    let wcode = if !access.wcode.is_empty() {
        Some(access.wcode.clone())
    } else {
        None
    };

    let mut session = service
        .get_session_context(schedule_id, wcode, access.legacy_student_key.clone(), None)
        .await?;

    if query.refresh_attempt_credential.unwrap_or(false) {
        let attempt = session.attempt.as_ref().ok_or_else(|| {
            ApiError::new(
                StatusCode::NOT_FOUND,
                "NOT_FOUND",
                "Student attempt not found for this session.",
            )
        })?;

        let fallback_client_session_id = attempt
            .integrity
            .get("clientSessionId")
            .and_then(|value| value.as_str())
            .map(ToOwned::to_owned);

        let client_session_id = query
            .client_session_id
            .clone()
            .or(fallback_client_session_id)
            .ok_or_else(|| {
                ApiError::new(
                    StatusCode::UNPROCESSABLE_ENTITY,
                    "VALIDATION_ERROR",
                    "clientSessionId is required to refresh attempt credentials.",
                )
            })?;

        let auth_service = AuthService::new(state.db_pool(), state.config.clone());
        session.attempt_credential = Some(
            auth_service
                .issue_attempt_token(
                    &ielts_backend_application::auth::AuthenticatedSession {
                        user: principal.user.clone(),
                        session: principal.session.clone(),
                    },
                    schedule_id.to_string(),
                    attempt.id.clone(),
                    client_session_id,
                    None,
                    None,
                )
                .await
                .map_err(map_auth_error)?,
        );
    }
    state
        .telemetry
        .observe_db_operation("delivery.get_session_context", started.elapsed());
    Ok(ApiResponse::success_with_request_id(session, request_id.0))
}

pub async fn get_student_static_session(
    State(state): State<AppState>,
    Extension(request_id): Extension<RequestId>,
    principal: AuthenticatedUser,
    Path(schedule_id): Path<Uuid>,
) -> Result<ApiResponse<StudentStaticSessionContext>, ApiError> {
    principal.require_one_of(&[
        UserRole::Student,
        UserRole::Admin,
        UserRole::Builder,
        UserRole::Proctor,
    ])?;
    authorize_student(&state, &principal, schedule_id).await?;
    let service = delivery_service(&state);
    let started = Instant::now();
    let session = service.get_static_session_context(schedule_id).await?;
    state
        .telemetry
        .observe_db_operation("delivery.get_static_session_context", started.elapsed());
    Ok(ApiResponse::success_with_request_id(session, request_id.0))
}

pub async fn get_student_live_session(
    State(state): State<AppState>,
    Extension(request_id): Extension<RequestId>,
    principal: AuthenticatedUser,
    Path(schedule_id): Path<Uuid>,
    Query(query): Query<StudentSessionQuery>,
) -> Result<ApiResponse<StudentLiveSessionContext>, ApiError> {
    principal.require_one_of(&[
        UserRole::Student,
        UserRole::Admin,
        UserRole::Builder,
        UserRole::Proctor,
    ])?;
    let access = authorize_student(&state, &principal, schedule_id).await?;
    let service = delivery_service(&state);
    let started = Instant::now();

    let wcode = if !access.wcode.is_empty() {
        Some(access.wcode.clone())
    } else {
        None
    };

    let session = service
        .get_live_session_context(
            schedule_id,
            wcode,
            query.student_key.or(access.legacy_student_key.clone()),
            query.candidate_id,
        )
        .await?;
    state
        .telemetry
        .observe_db_operation("delivery.get_live_session_context", started.elapsed());
    Ok(ApiResponse::success_with_request_id(session, request_id.0))
}

#[derive(Debug, Clone, Copy, serde::Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum HeartbeatResponseMode {
    Full,
    Ack,
}

#[derive(Debug, Default, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HeartbeatQuery {
    pub response_mode: Option<HeartbeatResponseMode>,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ApiMutationBatchRequest {
    attempt_id: String,
    mutations: Vec<ApiMutationCommand>,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ApiMutationCommand {
    mutation_id: String,
    base_revision: i32,
    #[serde(flatten)]
    command: ApiMutationCommandPayload,
}

#[derive(Debug, serde::Deserialize)]
#[serde(tag = "type", deny_unknown_fields)]
enum ApiMutationCommandPayload {
    SetSlot {
        #[serde(rename = "questionId")]
        question_id: String,
        #[serde(rename = "slotIndex")]
        slot_index: i32,
        value: String,
    },
    ClearSlot {
        #[serde(rename = "questionId")]
        question_id: String,
        #[serde(rename = "slotIndex")]
        slot_index: i32,
    },
    SetScalar {
        #[serde(rename = "questionId")]
        question_id: String,
        value: String,
    },
    ClearScalar {
        #[serde(rename = "questionId")]
        question_id: String,
    },
    SetChoice {
        #[serde(rename = "questionId")]
        question_id: String,
        value: Value,
    },
    ClearChoice {
        #[serde(rename = "questionId")]
        question_id: String,
    },
    SetEssayText {
        #[serde(rename = "taskId")]
        task_id: String,
        value: String,
    },
    ClearEssayText {
        #[serde(rename = "taskId")]
        task_id: String,
    },
}

impl ApiMutationCommandPayload {
    fn mutation_type(&self) -> &'static str {
        match self {
            Self::SetSlot { .. } => "SetSlot",
            Self::ClearSlot { .. } => "ClearSlot",
            Self::SetScalar { .. } => "SetScalar",
            Self::ClearScalar { .. } => "ClearScalar",
            Self::SetChoice { .. } => "SetChoice",
            Self::ClearChoice { .. } => "ClearChoice",
            Self::SetEssayText { .. } => "SetEssayText",
            Self::ClearEssayText { .. } => "ClearEssayText",
        }
    }

    fn payload(&self, base_revision: i32) -> Value {
        match self {
            Self::SetSlot {
                question_id,
                slot_index,
                value,
            } => json!({
                "baseRevision": base_revision,
                "questionId": question_id,
                "slotIndex": slot_index,
                "value": value
            }),
            Self::ClearSlot {
                question_id,
                slot_index,
            } => json!({
                "baseRevision": base_revision,
                "questionId": question_id,
                "slotIndex": slot_index
            }),
            Self::SetScalar { question_id, value } => json!({
                "baseRevision": base_revision,
                "questionId": question_id,
                "value": value
            }),
            Self::ClearScalar { question_id } => json!({
                "baseRevision": base_revision,
                "questionId": question_id
            }),
            Self::SetChoice { question_id, value } => json!({
                "baseRevision": base_revision,
                "questionId": question_id,
                "value": value
            }),
            Self::ClearChoice { question_id } => json!({
                "baseRevision": base_revision,
                "questionId": question_id
            }),
            Self::SetEssayText { task_id, value } => json!({
                "baseRevision": base_revision,
                "taskId": task_id,
                "value": value
            }),
            Self::ClearEssayText { task_id } => json!({
                "baseRevision": base_revision,
                "taskId": task_id
            }),
        }
    }
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ApiSubmitRequest {
    attempt_id: String,
    last_seen_revision: i32,
    submission_id: String,
}

pub async fn save_precheck(
    State(state): State<AppState>,
    Extension(request_id): Extension<RequestId>,
    principal: AuthenticatedUser,
    _csrf: VerifiedCsrf,
    Path(schedule_id): Path<Uuid>,
    Json(req): Json<StudentPrecheckRequest>,
) -> Result<ApiResponse<ielts_backend_domain::attempt::StudentAttempt>, ApiError> {
    principal.require_one_of(&[
        UserRole::Student,
        UserRole::Admin,
        UserRole::Builder,
        UserRole::Proctor,
    ])?;
    let access = authorize_student(&state, &principal, schedule_id).await?;
    let service = delivery_service(&state);
    let started = Instant::now();

    let wcode = if !access.wcode.is_empty() {
        Some(access.wcode.clone())
    } else {
        None
    };

    let attempt = service
        .persist_precheck(
            schedule_id,
            StudentPrecheckRequest {
                wcode,
                email: Some(access.email.clone()),
                student_key: access_key(&access),
                candidate_id: access.student_id.clone(),
                candidate_name: access.student_name.clone(),
                candidate_email: access.email.clone(),
                client_session_id: req.client_session_id,
                pre_check: req.pre_check,
                device_fingerprint_hash: req.device_fingerprint_hash,
            },
        )
        .await?;
    state
        .telemetry
        .observe_db_operation("delivery.persist_precheck", started.elapsed());
    Ok(ApiResponse::success_with_request_id(attempt, request_id.0))
}

pub async fn bootstrap_student_session(
    State(state): State<AppState>,
    Extension(request_id): Extension<RequestId>,
    principal: AuthenticatedUser,
    _csrf: VerifiedCsrf,
    Path(schedule_id): Path<Uuid>,
    Json(req): Json<StudentBootstrapRequest>,
) -> Result<ApiResponse<StudentSessionContext>, ApiError> {
    principal.require_one_of(&[
        UserRole::Student,
        UserRole::Admin,
        UserRole::Builder,
        UserRole::Proctor,
    ])?;

    // Apply per-user rate limiting for bootstrap
    let key = RateLimitKey::User(principal.user.id.clone());
    let config = RateLimitConfig::new(
        state.config.rate_limit_student_bootstrap_per_user,
        state
            .config
            .rate_limit_student_bootstrap_per_user_window_secs,
    );
    match state.rate_limiter.check_with_config(&key, &config).await {
        RateLimitResult::Allowed { .. } => {}
        RateLimitResult::Denied { retry_after } => {
            return Err(ApiError::new(
                StatusCode::TOO_MANY_REQUESTS,
                "RATE_LIMIT_EXCEEDED",
                &format!(
                    "Too many bootstrap attempts. Retry after {} seconds.",
                    retry_after.as_secs()
                ),
            ));
        }
    }
    let access = authorize_student(&state, &principal, schedule_id).await?;
    let service = delivery_service(&state);
    let started = Instant::now();

    let wcode = if !access.wcode.is_empty() {
        Some(access.wcode.clone())
    } else {
        None
    };

    let client_session_id = req.client_session_id.clone();

    let mut session = service
        .bootstrap(
            schedule_id,
            StudentBootstrapRequest {
                wcode,
                email: Some(access.email.clone()),
                student_key: access_key(&access),
                candidate_id: access.student_id.clone(),
                candidate_name: access.student_name.clone(),
                candidate_email: access.email.clone(),
                client_session_id: req.client_session_id,
            },
        )
        .await?;
    let auth_service = AuthService::new(state.db_pool(), state.config.clone());
    let attempt = session.attempt.as_ref().ok_or_else(|| {
        ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "INTERNAL_ERROR",
            "Missing student attempt context.",
        )
    })?;
    session.attempt_credential = Some(
        auth_service
            .issue_attempt_token(
                &ielts_backend_application::auth::AuthenticatedSession {
                    user: principal.user.clone(),
                    session: principal.session.clone(),
                },
                schedule_id.to_string(),
                attempt.id.clone(),
                client_session_id,
                None,
                None,
            )
            .await
            .map_err(map_auth_error)?,
    );
    state
        .telemetry
        .observe_db_operation("delivery.bootstrap", started.elapsed());
    Ok(ApiResponse::success_with_request_id(session, request_id.0))
}

pub async fn apply_mutation_batch(
    State(state): State<AppState>,
    Extension(request_id): Extension<RequestId>,
    principal: AttemptPrincipal,
    headers: HeaderMap,
    Path((schedule_id, _batch)): Path<(Uuid, String)>,
    Json(payload): Json<Value>,
) -> Result<ApiResponse<StudentMutationBatchResponse>, ApiError> {
    let api_req: ApiMutationBatchRequest = serde_json::from_value(payload).map_err(|err| {
        ApiError::new(
            StatusCode::UNPROCESSABLE_ENTITY,
            "VALIDATION_ERROR",
            &format!("Invalid mutation batch payload: {err}"),
        )
    })?;
    let attempt_id = principal.authorization.claims.attempt_id.clone();
    let claims_schedule_id = principal.authorization.claims.schedule_id.clone();
    let claims_client_session_id = principal.authorization.claims.client_session_id.clone();

    // Apply per-attempt rate limiting for mutations
    let key = RateLimitKey::Attempt(attempt_id.clone());
    let config = RateLimitConfig::new(
        state.config.rate_limit_mutation_per_attempt,
        state.config.rate_limit_mutation_per_attempt_window_secs,
    )
    .with_burst(50); // Allow burst for reconnect replay
    match state.rate_limiter.check_with_config(&key, &config).await {
        RateLimitResult::Allowed { .. } => {}
        RateLimitResult::Denied { retry_after } => {
            return Err(ApiError::new(
                StatusCode::TOO_MANY_REQUESTS,
                "RATE_LIMIT_EXCEEDED",
                &format!(
                    "Too many mutation attempts. Retry after {} seconds.",
                    retry_after.as_secs()
                ),
            ));
        }
    }

    if claims_schedule_id != schedule_id.to_string() {
        return Err(ApiError::new(
            StatusCode::FORBIDDEN,
            "FORBIDDEN",
            "Attempt credential does not match the schedule.",
        ));
    }
    if api_req.attempt_id != attempt_id {
        return Err(ApiError::new(
            StatusCode::UNPROCESSABLE_ENTITY,
            "VALIDATION_ERROR",
            "Body attemptId does not match the route-authorized attempt.",
        ));
    }

    if api_req.mutations.len() > state.config.max_mutations_per_batch {
        return Err(ApiError::new(
            StatusCode::UNPROCESSABLE_ENTITY,
            "VALIDATION_ERROR",
            &format!(
                "Mutation batch exceeds the maximum of {} mutations.",
                state.config.max_mutations_per_batch
            ),
        ));
    }

    let contains_violation = false;
    let req = StudentMutationBatchRequest {
        attempt_id: attempt_id.clone(),
        student_key: load_attempt_student_key(&state, &attempt_id).await?,
        client_session_id: claims_client_session_id,
        mutations: api_req
            .mutations
            .iter()
            .enumerate()
            .map(|(index, mutation)| MutationEnvelope {
                id: mutation.mutation_id.clone(),
                seq: (index + 1) as i64,
                timestamp: Utc::now(),
                mutation_type: mutation.command.mutation_type().to_owned(),
                base_revision: Some(mutation.base_revision),
                payload: mutation.command.payload(mutation.base_revision),
            })
            .collect(),
    };
    let service = delivery_service(&state);
    let started = Instant::now();
    let mut result = service
        .apply_mutation_batch(
            schedule_id,
            req,
            MutationBatchResponseMode::Full,
            extract_idempotency_key(&headers)?,
        )
        .await?;
    let auth_service = AuthService::new(state.db_pool(), state.config.clone());
    result.refreshed_attempt_credential = auth_service
        .maybe_refresh_attempt_token(&principal.authorization)
        .await
        .map_err(map_auth_error)?;
    let duration = started.elapsed();
    state
        .telemetry
        .observe_db_operation("delivery.apply_mutation_batch", duration);
    state
        .telemetry
        .observe_answer_commit("mutation_batch", duration);

    if contains_violation {
        state
            .live_updates
            .publish(ielts_backend_domain::schedule::LiveUpdateEvent {
                kind: "schedule_roster".to_owned(),
                id: schedule_id.to_string(),
                revision: 0,
                event: "violation_snapshot_changed".to_owned(),
            });
    }
    Ok(ApiResponse::success_with_request_id(result, request_id.0))
}

fn parse_mutation_batch_response_mode(
    payload: &Value,
) -> Result<MutationBatchResponseMode, ApiError> {
    match payload.get("responseMode").and_then(Value::as_str) {
        None => Ok(MutationBatchResponseMode::Full),
        Some("full") => Ok(MutationBatchResponseMode::Full),
        Some("ack") => Ok(MutationBatchResponseMode::Ack),
        Some(_) => Err(ApiError::new(
            StatusCode::UNPROCESSABLE_ENTITY,
            "VALIDATION_ERROR",
            "responseMode must be either 'full' or 'ack'.",
        )),
    }
}

pub async fn record_heartbeat(
    State(state): State<AppState>,
    Extension(request_id): Extension<RequestId>,
    principal: AttemptPrincipal,
    Path(schedule_id): Path<Uuid>,
    Query(query): Query<HeartbeatQuery>,
    Json(mut req): Json<StudentHeartbeatRequest>,
) -> Result<ApiResponse<StudentHeartbeatResponse>, ApiError> {
    let attempt_id = principal.authorization.claims.attempt_id.clone();
    let claims_schedule_id = principal.authorization.claims.schedule_id.clone();
    let claims_client_session_id = principal.authorization.claims.client_session_id.clone();

    // Apply per-attempt rate limiting for heartbeats (generous limit)
    let key = RateLimitKey::Attempt(attempt_id.clone());
    let config = RateLimitConfig::new(
        state.config.rate_limit_heartbeat_per_attempt,
        state.config.rate_limit_heartbeat_per_attempt_window_secs,
    )
    .with_burst(20); // Small burst allowance
    match state.rate_limiter.check_with_config(&key, &config).await {
        RateLimitResult::Allowed { .. } => {}
        RateLimitResult::Denied { retry_after } => {
            return Err(ApiError::new(
                StatusCode::TOO_MANY_REQUESTS,
                "RATE_LIMIT_EXCEEDED",
                &format!(
                    "Too many heartbeat attempts. Retry after {} seconds.",
                    retry_after.as_secs()
                ),
            ));
        }
    }

    if claims_schedule_id != schedule_id.to_string() {
        return Err(ApiError::new(
            StatusCode::FORBIDDEN,
            "FORBIDDEN",
            "Attempt credential does not match the schedule.",
        ));
    }
    req.attempt_id = Some(attempt_id.clone());
    req.client_session_id = claims_client_session_id;
    req.student_key = load_attempt_student_key(&state, &attempt_id).await?;
    let service = delivery_service(&state);
    let started = Instant::now();
    let event_type = req.event_type.clone();
    let ack_only =
        event_type == "heartbeat" && query.response_mode != Some(HeartbeatResponseMode::Full);
    let attempt = service.record_heartbeat(schedule_id, req).await?;
    let auth_service = AuthService::new(state.db_pool(), state.config.clone());
    state
        .telemetry
        .observe_db_operation("delivery.record_heartbeat", started.elapsed());
    if event_type != "heartbeat" {
        let event = match event_type.as_str() {
            "disconnect" => "network_disconnected",
            "reconnect" => "network_reconnected",
            "lost" => "heartbeat_lost",
            _ => "student_network",
        };
        state
            .live_updates
            .publish(ielts_backend_domain::schedule::LiveUpdateEvent {
                kind: "schedule_alert".to_owned(),
                id: schedule_id.to_string(),
                revision: 0,
                event: event.to_owned(),
            });
    }
    Ok(ApiResponse::success_with_request_id(
        StudentHeartbeatResponse {
            attempt: if ack_only { None } else { Some(attempt) },
            refreshed_attempt_credential: auth_service
                .maybe_refresh_attempt_token(&principal.authorization)
                .await
                .map_err(map_auth_error)?,
        },
        request_id.0,
    ))
}

pub async fn record_audit(
    State(state): State<AppState>,
    Extension(request_id): Extension<RequestId>,
    principal: AttemptPrincipal,
    Path(schedule_id): Path<Uuid>,
    Json(req): Json<StudentAuditLogRequest>,
) -> Result<ApiResponse<()>, ApiError> {
    let attempt_id = principal.authorization.claims.attempt_id.clone();
    let claims_schedule_id = principal.authorization.claims.schedule_id.clone();

    // Apply per-attempt rate limiting for audits
    let key = RateLimitKey::Attempt(attempt_id.clone());
    let config = RateLimitConfig::new(
        state.config.rate_limit_audit_per_attempt,
        state.config.rate_limit_audit_per_attempt_window_secs,
    )
    .with_burst(30);
    match state.rate_limiter.check_with_config(&key, &config).await {
        RateLimitResult::Allowed { .. } => {}
        RateLimitResult::Denied { retry_after } => {
            return Err(ApiError::new(
                StatusCode::TOO_MANY_REQUESTS,
                "RATE_LIMIT_EXCEEDED",
                &format!(
                    "Too many audit attempts. Retry after {} seconds.",
                    retry_after.as_secs()
                ),
            ));
        }
    }

    if claims_schedule_id != schedule_id.to_string() {
        return Err(ApiError::new(
            StatusCode::FORBIDDEN,
            "FORBIDDEN",
            "Attempt credential does not match the schedule.",
        ));
    }

    let candidate_name = load_attempt_candidate_name(&state, &attempt_id).await?;

    let client_timestamp = req.client_timestamp.clone();

    let mut payload_map = serde_json::Map::new();
    if let Some(client_timestamp) = client_timestamp.as_ref() {
        payload_map.insert("clientTimestamp".to_owned(), json!(client_timestamp));
    }
    if let Some(payload) = req.payload {
        match payload {
            Value::Object(fields) => {
                for (key, value) in fields {
                    payload_map.insert(key, value);
                }
            }
            other => {
                payload_map.insert("payload".to_owned(), other);
            }
        }
    }
    let payload_value = Value::Object(payload_map);

    sqlx::query(
        r#"
        INSERT INTO session_audit_logs (
            id, schedule_id, actor, action_type, target_student_id, payload, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, NOW())
        "#,
    )
    .bind(Uuid::new_v4().to_string())
    .bind(schedule_id.to_string())
    .bind(&candidate_name)
    .bind(&req.action_type)
    .bind(&attempt_id)
    .bind(payload_value.clone())
    .execute(&state.db_pool())
    .await
    .map_err(|err| {
        ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "DATABASE_ERROR",
            &err.to_string(),
        )
    })?;

    if req.action_type == "VIOLATION_DETECTED" {
        let violation_type = payload_value
            .get("violationType")
            .and_then(Value::as_str)
            .map(str::to_owned);
        let severity = payload_value
            .get("severity")
            .and_then(Value::as_str)
            .map(str::to_owned);
        let description = payload_value
            .get("message")
            .or_else(|| payload_value.get("description"))
            .and_then(Value::as_str)
            .unwrap_or("Violation detected.")
            .to_owned();

        if let (Some(violation_type), Some(severity)) = (violation_type, severity) {
            let allowed = matches!(severity.as_str(), "low" | "medium" | "high" | "critical");
            if allowed {
                let violation_id = Uuid::new_v4();
                sqlx::query(
                    r#"
                    INSERT INTO student_violation_events (
                        id, schedule_id, attempt_id, violation_type, severity, description, payload, created_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
                    "#,
                )
                .bind(violation_id.to_string())
                .bind(schedule_id.to_string())
                .bind(&attempt_id)
                .bind(&violation_type)
                .bind(&severity)
                .bind(&description)
                .bind(payload_value.clone())
                .execute(&state.db_pool())
                .await
                .map_err(|err| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "DATABASE_ERROR", &err.to_string()))?;

                let violation_json = json!({
                    "id": violation_id,
                    "type": violation_type,
                    "severity": severity,
                    "timestamp": client_timestamp.unwrap_or_else(Utc::now),
                    "description": description
                });
                sqlx::query(
                    r#"
                    UPDATE student_attempts
                    SET
                        violations_snapshot = JSON_MERGE_PRESERVE(COALESCE(violations_snapshot, JSON_ARRAY()), ?),
                        updated_at = NOW(),
                        revision = revision + 1
                    WHERE id = ? AND schedule_id = ?
                    "#,
                )
                .bind(violation_json)
                .bind(&attempt_id)
                .bind(schedule_id.to_string())
                .execute(&state.db_pool())
                .await
                .map_err(|err| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "DATABASE_ERROR", &err.to_string()))?;
            }
        }
    }

    let publish_alert = matches!(
        req.action_type.as_str(),
        "HEARTBEAT_LOST"
            | "DEVICE_CONTINUITY_FAILED"
            | "NETWORK_DISCONNECTED"
            | "AUTO_ACTION"
            | "STUDENT_WARN"
            | "STUDENT_PAUSE"
            | "STUDENT_TERMINATE"
            | "VIOLATION_DETECTED"
    );
    if publish_alert {
        state
            .live_updates
            .publish(ielts_backend_domain::schedule::LiveUpdateEvent {
                kind: "schedule_alert".to_owned(),
                id: schedule_id.to_string(),
                revision: 0,
                event: "alert_changed".to_owned(),
            });
    }

    Ok(ApiResponse::success_with_request_id((), request_id.0))
}

pub async fn submit_student_session(
    State(state): State<AppState>,
    Extension(request_id): Extension<RequestId>,
    principal: AttemptPrincipal,
    headers: HeaderMap,
    Path(schedule_id): Path<Uuid>,
    Json(payload): Json<Value>,
) -> Result<ApiResponse<StudentSubmitResponse>, ApiError> {
    let api_req: ApiSubmitRequest = serde_json::from_value(payload).map_err(|err| {
        ApiError::new(
            StatusCode::UNPROCESSABLE_ENTITY,
            "VALIDATION_ERROR",
            &format!("Invalid submit payload: {err}"),
        )
    })?;
    let attempt_id = principal.authorization.claims.attempt_id.clone();
    let claims_schedule_id = principal.authorization.claims.schedule_id.clone();
    let claims_client_session_id = principal.authorization.claims.client_session_id.clone();

    // Apply strict per-attempt rate limiting for submit (idempotency enforcement)
    let key = RateLimitKey::Attempt(attempt_id.clone());
    let config = RateLimitConfig::new(
        state.config.rate_limit_submit_per_attempt,
        state.config.rate_limit_submit_per_attempt_window_secs,
    );
    match state.rate_limiter.check_with_config(&key, &config).await {
        RateLimitResult::Allowed { .. } => {}
        RateLimitResult::Denied { retry_after } => {
            return Err(ApiError::new(
                StatusCode::TOO_MANY_REQUESTS,
                "RATE_LIMIT_EXCEEDED",
                &format!(
                    "Too many submit attempts. Retry after {} seconds.",
                    retry_after.as_secs()
                ),
            ));
        }
    }

    if claims_schedule_id != schedule_id.to_string() {
        return Err(ApiError::new(
            StatusCode::FORBIDDEN,
            "FORBIDDEN",
            "Attempt credential does not match the schedule.",
        ));
    }
    if api_req.attempt_id != attempt_id {
        return Err(ApiError::new(
            StatusCode::UNPROCESSABLE_ENTITY,
            "VALIDATION_ERROR",
            "Body attemptId does not match the route-authorized attempt.",
        ));
    }
    let idempotency_key = require_idempotency_key(&headers, "submit")?;
    let req = StudentSubmitRequest {
        attempt_id: attempt_id.clone(),
        student_key: load_attempt_student_key(&state, &attempt_id).await?,
        last_seen_revision: Some(api_req.last_seen_revision),
        submission_id: Some(api_req.submission_id),
        client_session_id: Some(claims_client_session_id),
        answers: None,
        writing_answers: None,
        flags: None,
    };
    let service = delivery_service(&state);
    let started = Instant::now();
    let mut submission = service
        .submit_attempt(schedule_id, req, Some(idempotency_key))
        .await?;
    let auth_service = AuthService::new(state.db_pool(), state.config.clone());
    submission.refreshed_attempt_credential = auth_service
        .maybe_refresh_attempt_token(&principal.authorization)
        .await
        .map_err(map_auth_error)?;
    let duration = started.elapsed();
    state
        .telemetry
        .observe_db_operation("delivery.submit_attempt", duration);
    state.telemetry.observe_answer_commit("submit", duration);
    Ok(ApiResponse::success_with_request_id(
        submission,
        request_id.0,
    ))
}

impl From<DeliveryError> for ApiError {
    fn from(err: DeliveryError) -> Self {
        match err {
            DeliveryError::Conflict {
                message,
                reason,
                latest_revision,
                server_accepted_through_seq,
                active_session_id,
            } => {
                let api = ApiError::new(StatusCode::CONFLICT, "CONFLICT", &message);
                let mut details = serde_json::Map::new();
                if let Some(reason) = reason {
                    details.insert("reason".to_owned(), json!(reason.as_str()));
                }
                if let Some(latest_revision) = latest_revision {
                    details.insert("latestRevision".to_owned(), json!(latest_revision));
                }
                if let Some(server_accepted_through_seq) = server_accepted_through_seq {
                    details.insert(
                        "serverAcceptedThroughSeq".to_owned(),
                        json!(server_accepted_through_seq),
                    );
                }
                if let Some(active_session_id) = active_session_id {
                    details.insert("activeSessionId".to_owned(), json!(active_session_id));
                }
                if details.is_empty() {
                    api
                } else {
                    api.with_details(Value::Object(details))
                }
            }
            DeliveryError::NotFound => {
                ApiError::new(StatusCode::NOT_FOUND, "NOT_FOUND", "Resource not found")
            }
            DeliveryError::Validation(msg) => {
                ApiError::new(StatusCode::UNPROCESSABLE_ENTITY, "VALIDATION_ERROR", &msg)
            }
            DeliveryError::Internal(msg) => {
                ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", &msg)
            }
            DeliveryError::Database(err) => ApiError::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "DATABASE_ERROR",
                &err.to_string(),
            ),
        }
    }
}

fn extract_idempotency_key(headers: &HeaderMap) -> Result<Option<String>, ApiError> {
    let Some(value) = headers.get("Idempotency-Key") else {
        return Ok(None);
    };
    let value = value.to_str().map_err(|_| {
        ApiError::new(
            StatusCode::UNPROCESSABLE_ENTITY,
            "VALIDATION_ERROR",
            "Idempotency-Key header must be valid ASCII text.",
        )
    })?;
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(ApiError::new(
            StatusCode::UNPROCESSABLE_ENTITY,
            "VALIDATION_ERROR",
            "Idempotency-Key header cannot be empty.",
        ));
    }

    Ok(Some(trimmed.to_owned()))
}

fn require_idempotency_key(headers: &HeaderMap, operation: &str) -> Result<String, ApiError> {
    extract_idempotency_key(headers)?.ok_or_else(|| {
        ApiError::new(
            StatusCode::UNPROCESSABLE_ENTITY,
            "VALIDATION_ERROR",
            &format!("Idempotency-Key header is required for {operation} requests."),
        )
    })
}

async fn authorize_student(
    state: &AppState,
    principal: &AuthenticatedUser,
    schedule_id: Uuid,
) -> Result<StudentAccess, ApiError> {
    AuthService::new(state.db_pool(), state.config.clone())
        .authorize_student_schedule(
            &ielts_backend_application::auth::AuthenticatedSession {
                user: principal.user.clone(),
                session: principal.session.clone(),
            },
            schedule_id,
        )
        .await
        .map_err(|_| {
            ApiError::new(
                StatusCode::FORBIDDEN,
                "FORBIDDEN",
                "The authenticated student is not enrolled for this schedule.",
            )
        })
}

fn access_key(access: &StudentAccess) -> String {
    access
        .legacy_student_key
        .clone()
        .unwrap_or_else(|| format!("student-{}-{}", access.registration_id, access.student_id))
}

async fn load_attempt_student_key(state: &AppState, attempt_id: &str) -> Result<String, ApiError> {
    query_scalar("SELECT student_key FROM student_attempts WHERE id = ?")
        .bind(attempt_id)
        .fetch_optional(&state.db_pool())
        .await
        .map_err(|err| {
            ApiError::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "DATABASE_ERROR",
                &err.to_string(),
            )
        })?
        .ok_or_else(|| ApiError::new(StatusCode::NOT_FOUND, "NOT_FOUND", "Resource not found"))
}

async fn load_attempt_candidate_name(
    state: &AppState,
    attempt_id: &str,
) -> Result<String, ApiError> {
    query_scalar("SELECT candidate_name FROM student_attempts WHERE id = ?")
        .bind(attempt_id)
        .fetch_optional(&state.db_pool())
        .await
        .map_err(|err| {
            ApiError::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "DATABASE_ERROR",
                &err.to_string(),
            )
        })?
        .ok_or_else(|| ApiError::new(StatusCode::NOT_FOUND, "NOT_FOUND", "Resource not found"))
}

fn map_auth_error(error: ielts_backend_application::auth::AuthError) -> ApiError {
    match error {
        ielts_backend_application::auth::AuthError::Database(err) => ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "DATABASE_ERROR",
            &err.to_string(),
        ),
        ielts_backend_application::auth::AuthError::InvalidCredentials
        | ielts_backend_application::auth::AuthError::Unauthorized => ApiError::new(
            StatusCode::UNAUTHORIZED,
            "UNAUTHORIZED",
            "Authentication is required for this route.",
        ),
        ielts_backend_application::auth::AuthError::Forbidden => ApiError::new(
            StatusCode::FORBIDDEN,
            "FORBIDDEN",
            "The authenticated user is not allowed to access this route.",
        ),
        ielts_backend_application::auth::AuthError::Conflict(message) => {
            ApiError::new(StatusCode::CONFLICT, "CONFLICT", &message)
        }
        ielts_backend_application::auth::AuthError::Validation(message) => ApiError::new(
            StatusCode::UNPROCESSABLE_ENTITY,
            "VALIDATION_ERROR",
            &message,
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mutation_batch_rejects_unknown_top_level_fields() {
        let payload = json!({
            "attemptId": "attempt-1",
            "mutations": [],
            "answers": { "q1": "A" }
        });

        let parsed = serde_json::from_value::<ApiMutationBatchRequest>(payload);
        assert!(parsed.is_err());
    }

    #[test]
    fn mutation_batch_rejects_unknown_command_type() {
        let payload = json!({
            "attemptId": "attempt-1",
            "mutations": [{
                "mutationId": "m-1",
                "baseRevision": 0,
                "type": "ReplaceAnswer",
                "questionId": "q1",
                "value": "A"
            }]
        });

        let parsed = serde_json::from_value::<ApiMutationBatchRequest>(payload);
        assert!(parsed.is_err());
    }

    #[test]
    fn mutation_batch_rejects_unknown_command_fields() {
        let payload = json!({
            "attemptId": "attempt-1",
            "mutations": [{
                "mutationId": "m-1",
                "baseRevision": 0,
                "type": "SetScalar",
                "questionId": "q1",
                "value": "A",
                "answers": ["A", "B"]
            }]
        });

        let parsed = serde_json::from_value::<ApiMutationBatchRequest>(payload);
        assert!(parsed.is_err());
    }

    #[test]
    fn mutation_batch_accepts_allowlisted_command_and_preserves_base_revision() {
        let payload = json!({
            "attemptId": "attempt-1",
            "mutations": [{
                "mutationId": "m-1",
                "baseRevision": 7,
                "type": "SetSlot",
                "questionId": "q1",
                "slotIndex": 2,
                "value": "wolf"
            }]
        });

        let parsed = serde_json::from_value::<ApiMutationBatchRequest>(payload).unwrap();
        assert_eq!(parsed.mutations.len(), 1);
        let command = &parsed.mutations[0];
        assert_eq!(command.base_revision, 7);
        assert_eq!(command.command.mutation_type(), "SetSlot");
        assert_eq!(
            command.command.payload(command.base_revision),
            json!({
                "baseRevision": 7,
                "questionId": "q1",
                "slotIndex": 2,
                "value": "wolf"
            })
        );
    }

    #[test]
    fn submit_request_rejects_snapshot_fields() {
        let payload = json!({
            "attemptId": "attempt-1",
            "lastSeenRevision": 11,
            "submissionId": "submit-1",
            "answers": {"q1": "A"}
        });

        let parsed = serde_json::from_value::<ApiSubmitRequest>(payload);
        assert!(parsed.is_err());
    }

    #[test]
    fn require_idempotency_key_rejects_missing_header() {
        let headers = HeaderMap::new();
        let result = require_idempotency_key(&headers, "submit");
        assert!(result.is_err());
    }

    #[test]
    fn require_idempotency_key_accepts_present_header() {
        let mut headers = HeaderMap::new();
        headers.insert("Idempotency-Key", "submit-1".parse().unwrap());
        let result = require_idempotency_key(&headers, "submit");
        assert_eq!(result.unwrap(), "submit-1");
    }
}
