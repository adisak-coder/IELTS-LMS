use axum::{
    extract::{
        ws::{CloseFrame, Message, WebSocket, WebSocketUpgrade},
        Path, Query, State,
    },
    http::{header::COOKIE, StatusCode},
    response::IntoResponse,
};
use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;
use serde_json::json;
use std::{
    borrow::Cow,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use tokio::sync::{mpsc, oneshot, watch, Notify};

use crate::{
    http::{
        auth::parse_cookie,
        response::ApiError,
    },
    websocket_capacity::{
        acquire_websocket_connection_lease, renew_websocket_connection_lease,
        WebsocketConnectionCapacityConfig, WebsocketConnectionCapacityError,
        DEFAULT_LEASE_RENEW_INTERVAL, DEFAULT_LEASE_TTL,
    },
    state::AppState,
};
use ielts_backend_application::auth::AuthService;
use ielts_backend_domain::auth::UserRole;
use ielts_backend_domain::schedule::LiveUpdateEvent;
use uuid::Uuid;

#[derive(Debug)]
enum OutboundItem {
    TextWithAck(String, oneshot::Sender<()>),
    Pong(Vec<u8>),
    Event(LiveUpdateEvent),
}

#[derive(Debug, Clone)]
struct DisconnectReason {
    code: u16,
    reason: String,
}

async fn send_with_timeout<S>(
    sink: &mut S,
    msg: Message,
    timeout: Duration,
) -> Result<(), ()>
where
    S: futures_util::Sink<Message> + Unpin,
    <S as futures_util::Sink<Message>>::Error: std::fmt::Debug,
{
    let result = tokio::time::timeout(timeout, sink.send(msg)).await;
    match result {
        Ok(Ok(())) => Ok(()),
        Ok(Err(_)) | Err(_) => Err(()),
    }
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveUpdatesQuery {
    pub schedule_id: Option<String>,
    pub attempt_id: Option<String>,
}

pub async fn websocket_live(
    State(state): State<AppState>,
    Path(path): Path<String>,
    Query(query): Query<LiveUpdatesQuery>,
    headers: axum::http::HeaderMap,
    ws: WebSocketUpgrade,
) -> impl IntoResponse {
    // Extract and validate session from cookie for WebSocket authentication
    let session_token = match extract_ws_session_token(&headers, &state.config.auth_session_cookie_name) {
        Some(token) => token,
        None => {
            return ApiError::new(
                StatusCode::UNAUTHORIZED,
                "UNAUTHORIZED",
                "Authentication is required for WebSocket connections.",
            )
            .into_response();
        }
    };

    // Validate the session
    let service = AuthService::new(state.db_pool(), state.config.clone());
    let session = match service.current_session(&session_token).await {
        Ok(Some(session)) => session,
        Ok(None) | Err(_) => {
            return ApiError::new(
                StatusCode::UNAUTHORIZED,
                "UNAUTHORIZED",
                "Invalid or expired session.",
            )
            .into_response();
        }
    };

    let schedule_id = query.schedule_id.or_else(|| match path.as_str() {
        "" | "live" => None,
        other => Some(other.to_owned()),
    });
    let attempt_id = query.attempt_id;
    let user_role = session.user.role.clone();

    // Check per-user connection cap
    if !state.live_updates.can_user_connect(&session.user.id) {
        return ApiError::new(
            StatusCode::FORBIDDEN,
            "CONNECTION_LIMIT",
            "Maximum WebSocket connections for this user exceeded.",
        )
        .into_response();
    }

    let capacity_schedule_id = resolve_capacity_schedule_id(&state, schedule_id.as_deref(), attempt_id.as_deref()).await;
    let capacity_config = WebsocketConnectionCapacityConfig::new(
        state.config.websocket_connection_cap as u32,
        state.config.websocket_connections_per_schedule_cap as u32,
        DEFAULT_LEASE_TTL,
    );
    let lease = match acquire_websocket_connection_lease(
        &state.db_pool(),
        &session.user.id,
        capacity_schedule_id.as_deref(),
        &capacity_config,
    )
    .await
    {
        Ok(lease) => lease,
        Err(WebsocketConnectionCapacityError::GlobalCapacityReached) => {
            return ApiError::new(
                StatusCode::SERVICE_UNAVAILABLE,
                "INSTANCE_CAPACITY",
                "Server at maximum WebSocket capacity.",
            )
            .into_response();
        }
        Err(WebsocketConnectionCapacityError::ScheduleCapacityReached) => {
            return ApiError::new(
                StatusCode::SERVICE_UNAVAILABLE,
                "SCHEDULE_CAPACITY",
                "Maximum connections for this schedule exceeded.",
            )
            .into_response();
        }
        Err(WebsocketConnectionCapacityError::Database(err)) => {
            tracing::warn!(error = %err, "failed to acquire websocket lease");
            return ApiError::new(
                StatusCode::SERVICE_UNAVAILABLE,
                "CONNECTION_LIMIT",
                "Unable to allocate websocket capacity right now.",
            )
            .into_response();
        }
    };

    ws.write_buffer_size(0)
        .max_write_buffer_size(64 * 1024)
        .on_upgrade(move |socket| {
            handle_socket(
                socket,
                state,
                schedule_id,
                attempt_id,
                session.user.id,
                user_role,
                lease.id,
            )
        })
}

fn extract_ws_session_token(headers: &axum::http::HeaderMap, cookie_name: &str) -> Option<String> {
    let cookie_header = headers.get(COOKIE)?;
    let _cookie_str = cookie_header.to_str().ok()?;
    parse_cookie(Some(cookie_header), cookie_name).map(|s| s.to_owned())
}

async fn handle_socket(
    mut socket: WebSocket,
    state: AppState,
    schedule_id: Option<String>,
    attempt_id: Option<String>,
    user_id: String,
    user_role: UserRole,
    lease_id: Uuid,
) {
    let queue_cap = state.config.websocket_outbound_queue_cap.max(1);
    let slow_client_disconnect =
        Duration::from_millis(state.config.websocket_slow_client_disconnect_ms.max(1));
    let write_timeout = Duration::from_millis(state.config.websocket_write_timeout_ms.max(1));
    let lease_renew_interval = DEFAULT_LEASE_RENEW_INTERVAL;

    let current_connections = state.live_updates.connection_opened(&user_id);
    state
        .telemetry
        .set_websocket_connections(current_connections);
    let mut subscription = state.live_updates.subscribe();

    if let Some(ref sid) = schedule_id {
        state.live_updates.subscribe_to_schedule(sid, &user_id);
    }

    let connected_message = json!({
        "type": "connected",
        "scheduleId": schedule_id,
        "attemptId": attempt_id,
    });

    let (mut ws_sender, mut ws_receiver) = socket.split();
    let (outbound_tx, mut outbound_rx) = mpsc::channel::<OutboundItem>(queue_cap);
    let (writer_done_tx, mut writer_done_rx) = watch::channel(false);
    let notify = Arc::new(Notify::new());
    let latest_event: Arc<Mutex<Option<LiveUpdateEvent>>> = Arc::new(Mutex::new(None));
    let disconnect_reason: Arc<Mutex<Option<DisconnectReason>>> = Arc::new(Mutex::new(None));

    let renewal_pool = state.db_pool();
    let renewal_disconnect_reason = disconnect_reason.clone();
    let renewal_notify = notify.clone();
    let renewal_task = tokio::spawn(async move {
        let mut interval = tokio::time::interval(lease_renew_interval);
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
        interval.tick().await;

        loop {
            tokio::select! {
                _ = interval.tick() => {
                    match renew_websocket_connection_lease(&renewal_pool, lease_id, DEFAULT_LEASE_TTL).await {
                        Ok(true) => {}
                        Ok(false) | Err(_) => {
                            *renewal_disconnect_reason.lock().unwrap() = Some(DisconnectReason {
                                code: 1011,
                                reason: "lease renewal failed".to_owned(),
                            });
                            renewal_notify.notify_one();
                            break;
                        }
                    }
                }
                _ = renewal_notify.notified() => {
                    if renewal_disconnect_reason.lock().unwrap().is_some() {
                        break;
                    }
                }
            }
        }
    });

    let writer_notify = notify.clone();
    let writer_latest_event = latest_event.clone();
    let writer_disconnect_reason = disconnect_reason.clone();

    tokio::spawn(async move {
        loop {
            tokio::select! {
                item = outbound_rx.recv() => {
                    match item {
                        Some(OutboundItem::TextWithAck(payload, ack)) => {
                            let disconnecting = writer_disconnect_reason.lock().unwrap().is_some();
                            if disconnecting {
                                continue;
                            }
                            if send_with_timeout(&mut ws_sender, Message::Text(payload), write_timeout)
                                .await
                                .is_err()
                            {
                                break;
                            }
                            let _ = ack.send(());
                        }
                        Some(OutboundItem::Pong(payload)) => {
                            let disconnecting = writer_disconnect_reason.lock().unwrap().is_some();
                            if disconnecting {
                                continue;
                            }
                            if send_with_timeout(&mut ws_sender, Message::Pong(payload), write_timeout)
                                .await
                                .is_err()
                            {
                                break;
                            }
                        }
                        Some(OutboundItem::Event(event)) => {
                            let serialized = match serde_json::to_string(&event) {
                                Ok(value) => value,
                                Err(_) => break,
                            };
                            let disconnecting = writer_disconnect_reason.lock().unwrap().is_some();
                            if disconnecting {
                                continue;
                            }
                            if send_with_timeout(&mut ws_sender, Message::Text(serialized), write_timeout)
                                .await
                                .is_err()
                            {
                                break;
                            }
                        }
                        None => break,
                    }
                }
                _ = writer_notify.notified() => {}
            }

            let maybe_reason = { writer_disconnect_reason.lock().unwrap().take() };
            if let Some(reason) = maybe_reason {
                let close_frame = CloseFrame {
                    code: reason.code,
                    reason: Cow::Owned(reason.reason),
                };
                let _ = send_with_timeout(
                    &mut ws_sender,
                    Message::Close(Some(close_frame)),
                    write_timeout,
                )
                .await;
                break;
            }

            let maybe_event = { writer_latest_event.lock().unwrap().take() };
            if let Some(event) = maybe_event {
                let serialized = match serde_json::to_string(&event) {
                    Ok(value) => value,
                    Err(_) => break,
                };
                if send_with_timeout(&mut ws_sender, Message::Text(serialized), write_timeout)
                    .await
                    .is_err()
                {
                    break;
                }
            }

            tokio::task::yield_now().await;
        }

        let _ = writer_done_tx.send(true);
    });

    let (connected_ack_tx, connected_ack_rx) = oneshot::channel::<()>();
    match outbound_tx.try_send(OutboundItem::TextWithAck(
        connected_message.to_string(),
        connected_ack_tx,
    )) {
        Ok(()) => {}
        Err(_) => {
            *disconnect_reason.lock().unwrap() = Some(DisconnectReason {
                code: 1008,
                reason: "slow client".to_owned(),
            });
            notify.notify_one();
            let remaining = state.live_updates.connection_closed(&user_id);
            if let Some(ref sid) = schedule_id {
                state.live_updates.unsubscribe_from_schedule(sid, &user_id);
            }
            state.telemetry.set_websocket_connections(remaining);
            renewal_task.abort();
            let _ = crate::websocket_capacity::release_websocket_connection_lease(&state.db_pool(), lease_id).await;
            return;
        }
    }

    match tokio::time::timeout(write_timeout, connected_ack_rx).await {
        Ok(Ok(())) => {}
        _ => {
        *disconnect_reason.lock().unwrap() = Some(DisconnectReason {
            code: 1008,
            reason: "slow client".to_owned(),
        });
        notify.notify_one();
        let remaining = state.live_updates.connection_closed(&user_id);
        if let Some(ref sid) = schedule_id {
            state.live_updates.unsubscribe_from_schedule(sid, &user_id);
        }
        state.telemetry.set_websocket_connections(remaining);
        renewal_task.abort();
        let _ = crate::websocket_capacity::release_websocket_connection_lease(&state.db_pool(), lease_id).await;
        return;
        }
    }

    let mut saturation_since: Option<Instant> = None;

    loop {
        tokio::select! {
            update = subscription.recv() => {
                match update {
                    Ok(event) => {
                        if user_role == UserRole::Student {
                            let matches = match event.kind.as_str() {
                                "schedule_runtime" => schedule_id.as_deref().is_some_and(|value| value == event.id),
                                "attempt" => attempt_id.as_deref().is_some_and(|value| value == event.id),
                                _ => false,
                            };
                            if !matches {
                                continue;
                            }
                        } else {
                            // By default, staff connections don't receive attempt-scoped events
                            // unless they explicitly subscribe with attemptId.
                            if event.kind == "attempt" && attempt_id.is_none() {
                                continue;
                            }

                            let schedule_match = schedule_id.as_deref().is_some_and(|value| value == event.id);
                            let attempt_match = attempt_id.as_deref().is_some_and(|value| value == event.id);
                            if (schedule_id.is_some() || attempt_id.is_some()) && !(schedule_match || attempt_match) {
                                continue;
                            }
                        }

                        match outbound_tx.try_send(OutboundItem::Event(event)) {
                            Ok(()) => {
                                saturation_since = None;
                            }
                            Err(mpsc::error::TrySendError::Full(event)) => {
                                if saturation_since.is_none() {
                                    saturation_since = Some(Instant::now());
                                }
                                *latest_event.lock().unwrap() = Some(match event {
                                    OutboundItem::Event(value) => value,
                                    _ => unreachable!("mpsc full returns original item"),
                                });
                                notify.notify_one();

                                if saturation_since.is_some_and(|since| since.elapsed() >= slow_client_disconnect) {
                                    *disconnect_reason.lock().unwrap() = Some(DisconnectReason {
                                        code: 1008,
                                        reason: "slow client".to_owned(),
                                    });
                                    notify.notify_one();
                                    break;
                                }
                            }
                            Err(mpsc::error::TrySendError::Closed(_)) => break,
                        }
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => {}
                    Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
                }
            }
            inbound = ws_receiver.next() => {
                match inbound {
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Ok(Message::Ping(payload))) => {
                        match outbound_tx.try_send(OutboundItem::Pong(payload)) {
                            Ok(()) => {}
                            Err(_) => {
                                *disconnect_reason.lock().unwrap() = Some(DisconnectReason {
                                    code: 1008,
                                    reason: "slow client".to_owned(),
                                });
                                notify.notify_one();
                                break;
                            }
                        }
                    }
                    Some(Ok(_)) => {}
                    Some(Err(_)) => break,
                }
            }
            changed = writer_done_rx.changed() => {
                if changed.is_ok() && *writer_done_rx.borrow() {
                    break;
                }
            }
        }
    }

    let remaining = state.live_updates.connection_closed(&user_id);
    if let Some(ref sid) = schedule_id {
        state.live_updates.unsubscribe_from_schedule(sid, &user_id);
    }
    state.telemetry.set_websocket_connections(remaining);
    renewal_task.abort();
    let _ = crate::websocket_capacity::release_websocket_connection_lease(&state.db_pool(), lease_id).await;
}

async fn resolve_capacity_schedule_id(
    state: &AppState,
    schedule_id: Option<&str>,
    attempt_id: Option<&str>,
) -> Option<String> {
    if let Some(schedule_id) = schedule_id {
        return Some(schedule_id.to_owned());
    }

    let Some(attempt_id) = attempt_id else {
        return None;
    };

    match sqlx::query_scalar::<_, String>(
        "SELECT schedule_id FROM student_attempts WHERE id = ?",
    )
    .bind(attempt_id)
    .fetch_optional(&state.db_pool())
    .await
    {
        Ok(Some(schedule_id)) => Some(schedule_id),
        Ok(None) => None,
        Err(err) => {
            tracing::warn!(error = %err, attempt_id = %attempt_id, "failed to resolve websocket schedule for capacity");
            None
        }
    }
}
