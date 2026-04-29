use axum::{
    extract::MatchedPath,
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
    let (path, used_fallback_route_label) = metrics_route_label(&request);
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
    if used_fallback_route_label {
        state.telemetry.observe_request_route_fallback();
    }
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

fn metrics_route_label(request: &Request) -> (String, bool) {
    if let Some(path) = request
        .extensions()
        .get::<MatchedPath>()
        .map(MatchedPath::as_str)
    {
        return (path.to_owned(), false);
    }

    (normalize_metrics_route(request.uri().path()), true)
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

    if path == "/api" {
        "/api".to_owned()
    } else {
        "/api/*".to_owned()
    }
}

#[cfg(test)]
mod tests {
    use axum::{
        body::Body,
        http::{Request, StatusCode},
        middleware,
        routing::get,
        Router,
    };
    use ielts_backend_infrastructure::config::AppConfig;
    use tower::ServiceExt;

    use crate::state::AppState;

    use super::{normalize_metrics_route, request_id_middleware};

    #[test]
    fn fallback_normalizer_bounds_unknown_api_paths() {
        assert_eq!(
            normalize_metrics_route("/api/v1/unknown/submission-abc123"),
            "/api/*"
        );
    }

    #[test]
    fn fallback_normalizer_preserves_frontend_and_health_buckets() {
        assert_eq!(normalize_metrics_route("/"), "/");
        assert_eq!(normalize_metrics_route("/healthz"), "/healthz");
        assert_eq!(normalize_metrics_route("/readyz"), "/readyz");
        assert_eq!(normalize_metrics_route("/metrics"), "/metrics");
        assert_eq!(
            normalize_metrics_route("/assets/app-6d2af5.js"),
            "/assets/*"
        );
        assert_eq!(normalize_metrics_route("/student/entry"), "/frontend");
    }

    #[tokio::test]
    async fn middleware_uses_matched_path_template_for_metrics_labels() {
        let state = AppState::new(AppConfig::default());
        let app = Router::new()
            .route(
                "/api/v1/results/:result_id",
                get(|| async { StatusCode::OK }),
            )
            .layer(middleware::from_fn_with_state(
                state.clone(),
                request_id_middleware,
            ))
            .with_state(state.clone());

        for path in [
            "/api/v1/results/submission-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            "/api/v1/results/submission-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        ] {
            let response = app
                .clone()
                .oneshot(Request::builder().uri(path).body(Body::empty()).unwrap())
                .await
                .unwrap();

            assert_eq!(response.status(), StatusCode::OK);
        }

        let metrics = state.telemetry.render().unwrap();
        assert!(metrics.contains("route=\"/api/v1/results/:result_id\""));
        assert!(!metrics.contains("submission-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"));
        assert!(!metrics.contains("submission-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"));
    }
}
