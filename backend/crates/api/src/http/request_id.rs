use axum::{
    extract::Request,
    extract::State,
    http::{header::HeaderName, HeaderValue},
    middleware::Next,
    response::Response,
};
use uuid::Uuid;

use crate::state::AppState;

pub const REQUEST_ID_HEADER: &str = "x-request-id";

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RequestId(pub String);

pub async fn request_id_middleware(
    State(state): State<AppState>,
    mut request: Request,
    next: Next,
) -> Response {
    let request_id = request
        .headers()
        .get(header_name())
        .and_then(|value| value.to_str().ok())
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .unwrap_or_else(new_request_id);

    request
        .extensions_mut()
        .insert(RequestId(request_id.clone()));
    let method = request.method().to_string();
    let path = normalize_metrics_route(request.uri().path());
    request
        .headers_mut()
        .insert(header_name(), HeaderValue::from_str(&request_id).unwrap());
    let started = std::time::Instant::now();

    tracing::info!(
        request_id = %request_id,
        method = %method,
        path = %path,
        "request started"
    );

    let mut response = next.run(request).await;
    response
        .headers_mut()
        .insert(header_name(), HeaderValue::from_str(&request_id).unwrap());

    let duration = started.elapsed();
    state
        .telemetry
        .observe_request(&method, &path, response.status().as_u16(), duration);
    tracing::info!(
        request_id = %request_id,
        status = response.status().as_u16(),
        duration_ms = duration.as_millis() as u64,
        "request finished"
    );

    response
}

fn header_name() -> HeaderName {
    HeaderName::from_static(REQUEST_ID_HEADER)
}

fn new_request_id() -> String {
    format!("req_{}", Uuid::new_v4().simple())
}

fn normalize_metrics_route(path: &str) -> String {
    // Prevent high-cardinality Prometheus labels from frontend SPA routes and asset hashes.
    // Prometheus label sets are retained for the lifetime of the process, so using raw paths can
    // steadily increase memory usage as new unique URLs are requested.
    if !path.starts_with("/api/") && path != "/api" {
        return match path {
            "/" => "/".to_owned(),
            "/healthz" | "/readyz" | "/metrics" => path.to_owned(),
            _ if path.starts_with("/assets/") => "/assets/*".to_owned(),
            _ => "/frontend".to_owned(),
        };
    }

    let normalized = path
        .split('/')
        .map(|segment| {
            if segment.is_empty() {
                String::new()
            } else if looks_like_identifier(segment) {
                ":id".to_owned()
            } else {
                segment.to_owned()
            }
        })
        .collect::<Vec<_>>()
        .join("/");

    if normalized.is_empty() {
        "/".to_owned()
    } else {
        normalized
    }
}

fn looks_like_identifier(segment: &str) -> bool {
    segment.chars().all(|char| char.is_ascii_digit())
        || (segment.len() >= 24
            && segment
                .chars()
                .all(|char| char.is_ascii_hexdigit() || char == '-'))
}
