use std::{
    fmt,
    sync::{atomic::AtomicI64, Arc, Mutex},
    time::Duration,
};

use crate::database_monitor::GradingProjectionSnapshot;
use prometheus_client::{
    encoding::{text::encode, EncodeLabelSet},
    metrics::{
        counter::Counter,
        family::Family,
        gauge::Gauge,
        histogram::{exponential_buckets, Histogram},
    },
    registry::Registry,
};

#[derive(Clone, Debug, Hash, PartialEq, Eq, EncodeLabelSet)]
struct HttpRequestLabels {
    method: String,
    route: String,
    status: String,
}

#[derive(Clone, Debug, Hash, PartialEq, Eq, EncodeLabelSet)]
struct OperationLabels {
    operation: String,
}

#[derive(Clone, Debug, Hash, PartialEq, Eq, EncodeLabelSet)]
struct OutcomeLabels {
    outcome: String,
}

#[derive(Clone, Debug, Hash, PartialEq, Eq, EncodeLabelSet)]
struct ThresholdLabels {
    level: String,
}

#[derive(Clone, Debug, Hash, PartialEq, Eq, EncodeLabelSet)]
struct ProjectionEntityLabels {
    entity: String,
}

#[derive(Debug, Clone, Default)]
struct ProjectionTotals {
    schedule: u64,
    submission: u64,
    section: u64,
    writing_task: u64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ProcessMemoryProfile {
    pub resident_bytes: u64,
    pub resident_high_water_mark_bytes: u64,
    pub virtual_memory_bytes: u64,
    pub heap_bytes: u64,
    pub swap_bytes: u64,
}

#[derive(Clone)]
pub struct Telemetry {
    registry: Arc<Mutex<Registry>>,
    http_request_latency: Family<HttpRequestLabels, Histogram>,
    db_operation_latency: Family<OperationLabels, Histogram>,
    publish_validation_latency: Family<OutcomeLabels, Histogram>,
    answer_commit_latency: Family<OutcomeLabels, Histogram>,
    violation_to_alert_latency: Histogram,
    websocket_connections: Gauge<i64, AtomicI64>,
    outbox_backlog_events: Gauge<i64, AtomicI64>,
    outbox_oldest_age_seconds: Gauge<i64, AtomicI64>,
    storage_budget_bytes: Gauge<i64, AtomicI64>,
    storage_budget_level: Gauge<i64, AtomicI64>,
    process_resident_memory_bytes: Gauge<i64, AtomicI64>,
    process_resident_memory_high_water_mark_bytes: Gauge<i64, AtomicI64>,
    process_virtual_memory_bytes: Gauge<i64, AtomicI64>,
    process_heap_memory_bytes: Gauge<i64, AtomicI64>,
    process_swap_memory_bytes: Gauge<i64, AtomicI64>,
    process_memory_profile_collection_failures: Counter,
    rate_limiter_buckets: Gauge<i64, AtomicI64>,
    request_route_fallback_total: Counter,
    storage_budget_threshold_hits: Family<ThresholdLabels, Counter>,
    grading_projection_lag_seconds: Gauge<i64, AtomicI64>,
    grading_projection_cycle_duration_seconds: Histogram,
    grading_projection_rows_processed_total: Family<ProjectionEntityLabels, Counter>,
    grading_projection_failures_total: Counter,
    projection_last_totals: Arc<Mutex<ProjectionTotals>>,
    projection_last_failures_total: Arc<Mutex<u64>>,
}

impl fmt::Debug for Telemetry {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.debug_struct("Telemetry").finish_non_exhaustive()
    }
}

impl Default for Telemetry {
    fn default() -> Self {
        Self::new()
    }
}

impl Telemetry {
    pub fn new() -> Self {
        let http_request_latency =
            Family::<HttpRequestLabels, Histogram>::new_with_constructor(|| {
                Histogram::new(exponential_buckets(0.005, 2.0, 16))
            });
        let db_operation_latency =
            Family::<OperationLabels, Histogram>::new_with_constructor(|| {
                Histogram::new(exponential_buckets(0.001, 2.0, 16))
            });
        let publish_validation_latency =
            Family::<OutcomeLabels, Histogram>::new_with_constructor(|| {
                Histogram::new(exponential_buckets(0.001, 2.0, 14))
            });
        let answer_commit_latency =
            Family::<OutcomeLabels, Histogram>::new_with_constructor(|| {
                Histogram::new(exponential_buckets(0.001, 2.0, 14))
            });
        let violation_to_alert_latency = Histogram::new(exponential_buckets(0.001, 2.0, 14));
        let websocket_connections = Gauge::<i64, AtomicI64>::default();
        let outbox_backlog_events = Gauge::<i64, AtomicI64>::default();
        let outbox_oldest_age_seconds = Gauge::<i64, AtomicI64>::default();
        let storage_budget_bytes = Gauge::<i64, AtomicI64>::default();
        let storage_budget_level = Gauge::<i64, AtomicI64>::default();
        let process_resident_memory_bytes = Gauge::<i64, AtomicI64>::default();
        let process_resident_memory_high_water_mark_bytes = Gauge::<i64, AtomicI64>::default();
        let process_virtual_memory_bytes = Gauge::<i64, AtomicI64>::default();
        let process_heap_memory_bytes = Gauge::<i64, AtomicI64>::default();
        let process_swap_memory_bytes = Gauge::<i64, AtomicI64>::default();
        let process_memory_profile_collection_failures = Counter::default();
        let rate_limiter_buckets = Gauge::<i64, AtomicI64>::default();
        let request_route_fallback_total = Counter::default();
        let storage_budget_threshold_hits = Family::<ThresholdLabels, Counter>::default();
        let grading_projection_lag_seconds = Gauge::<i64, AtomicI64>::default();
        let grading_projection_cycle_duration_seconds =
            Histogram::new(exponential_buckets(0.001, 2.0, 14));
        let grading_projection_rows_processed_total =
            Family::<ProjectionEntityLabels, Counter>::default();
        let grading_projection_failures_total = Counter::default();

        let mut registry = Registry::default();
        registry.register(
            "backend_http_request_duration_seconds",
            "HTTP request latency by method, normalized route, and status code.",
            http_request_latency.clone(),
        );
        registry.register(
            "backend_db_operation_duration_seconds",
            "Measured database-backed operation latency.",
            db_operation_latency.clone(),
        );
        registry.register(
            "backend_publish_validation_duration_seconds",
            "Publish validation latency grouped by outcome.",
            publish_validation_latency.clone(),
        );
        registry.register(
            "backend_answer_commit_duration_seconds",
            "Answer mutation and submit durability latency grouped by outcome.",
            answer_commit_latency.clone(),
        );
        registry.register(
            "backend_violation_to_alert_duration_seconds",
            "Observed latency between alert-worthy audit timestamps and proctor alert reads.",
            violation_to_alert_latency.clone(),
        );
        registry.register(
            "backend_websocket_connections",
            "Active websocket connections tracked by this process.",
            websocket_connections.clone(),
        );
        registry.register(
            "backend_outbox_backlog_events",
            "Number of unpublished outbox rows pending fan-out.",
            outbox_backlog_events.clone(),
        );
        registry.register(
            "backend_outbox_oldest_age_seconds",
            "Age in seconds of the oldest unpublished outbox row.",
            outbox_oldest_age_seconds.clone(),
        );
        registry.register(
            "backend_storage_budget_bytes",
            "Current database size in bytes.",
            storage_budget_bytes.clone(),
        );
        registry.register(
            "backend_storage_budget_level",
            "Storage budget severity encoded as 0=normal, 1=warning, 2=high_water, 3=critical.",
            storage_budget_level.clone(),
        );
        registry.register(
            "backend_process_resident_memory_bytes",
            "Resident memory (RSS) in bytes for this process.",
            process_resident_memory_bytes.clone(),
        );
        registry.register(
            "backend_process_resident_memory_high_water_mark_bytes",
            "Peak resident memory (VmHWM) in bytes for this process.",
            process_resident_memory_high_water_mark_bytes.clone(),
        );
        registry.register(
            "backend_process_virtual_memory_bytes",
            "Virtual memory size (VmSize) in bytes for this process.",
            process_virtual_memory_bytes.clone(),
        );
        registry.register(
            "backend_process_heap_memory_bytes",
            "Data segment memory (VmData) in bytes for this process.",
            process_heap_memory_bytes.clone(),
        );
        registry.register(
            "backend_process_swap_memory_bytes",
            "Swap memory usage (VmSwap) in bytes for this process.",
            process_swap_memory_bytes.clone(),
        );
        registry.register(
            "backend_process_memory_profile_collection_failures_total",
            "Count of process memory profile collection failures.",
            process_memory_profile_collection_failures.clone(),
        );
        registry.register(
            "backend_rate_limiter_buckets",
            "Number of active in-memory rate limiter buckets.",
            rate_limiter_buckets.clone(),
        );
        registry.register(
            "backend_request_route_fallback_total",
            "Count of requests where metrics route labeling fell back to path bucketing.",
            request_route_fallback_total.clone(),
        );
        registry.register(
            "backend_storage_budget_threshold_hits_total",
            "Number of times storage budget checks have hit a given severity.",
            storage_budget_threshold_hits.clone(),
        );
        registry.register(
            "backend_grading_projection_lag_seconds",
            "Observed lag between source attempt updates and grading projection watermark.",
            grading_projection_lag_seconds.clone(),
        );
        registry.register(
            "backend_grading_projection_cycle_duration_seconds",
            "Observed grading projection cycle duration.",
            grading_projection_cycle_duration_seconds.clone(),
        );
        registry.register(
            "backend_grading_projection_rows_processed_total",
            "Total projected rows processed, grouped by entity.",
            grading_projection_rows_processed_total.clone(),
        );
        registry.register(
            "backend_grading_projection_failures_total",
            "Total grading projection cycle failures.",
            grading_projection_failures_total.clone(),
        );

        Self {
            registry: Arc::new(Mutex::new(registry)),
            http_request_latency,
            db_operation_latency,
            publish_validation_latency,
            answer_commit_latency,
            violation_to_alert_latency,
            websocket_connections,
            outbox_backlog_events,
            outbox_oldest_age_seconds,
            storage_budget_bytes,
            storage_budget_level,
            process_resident_memory_bytes,
            process_resident_memory_high_water_mark_bytes,
            process_virtual_memory_bytes,
            process_heap_memory_bytes,
            process_swap_memory_bytes,
            process_memory_profile_collection_failures,
            rate_limiter_buckets,
            request_route_fallback_total,
            storage_budget_threshold_hits,
            grading_projection_lag_seconds,
            grading_projection_cycle_duration_seconds,
            grading_projection_rows_processed_total,
            grading_projection_failures_total,
            projection_last_totals: Arc::new(Mutex::new(ProjectionTotals::default())),
            projection_last_failures_total: Arc::new(Mutex::new(0)),
        }
    }

    pub fn observe_request(&self, method: &str, route: &str, status: u16, duration: Duration) {
        let labels = HttpRequestLabels {
            method: method.to_owned(),
            route: route.to_owned(),
            status: status.to_string(),
        };
        self.http_request_latency
            .get_or_create(&labels)
            .observe(duration.as_secs_f64());
    }

    pub fn observe_db_operation(&self, operation: &str, duration: Duration) {
        let labels = OperationLabels {
            operation: operation.to_owned(),
        };
        self.db_operation_latency
            .get_or_create(&labels)
            .observe(duration.as_secs_f64());
    }

    pub fn observe_publish_validation(&self, outcome: &str, duration: Duration) {
        let labels = OutcomeLabels {
            outcome: outcome.to_owned(),
        };
        self.publish_validation_latency
            .get_or_create(&labels)
            .observe(duration.as_secs_f64());
    }

    pub fn observe_answer_commit(&self, outcome: &str, duration: Duration) {
        let labels = OutcomeLabels {
            outcome: outcome.to_owned(),
        };
        self.answer_commit_latency
            .get_or_create(&labels)
            .observe(duration.as_secs_f64());
    }

    pub fn observe_violation_to_alert(&self, duration: Duration) {
        self.violation_to_alert_latency
            .observe(duration.as_secs_f64());
    }

    pub fn set_websocket_connections(&self, count: i64) {
        self.websocket_connections.set(count.max(0));
    }

    pub fn observe_outbox_backlog(&self, pending_count: u64, oldest_age_seconds: i64) {
        self.outbox_backlog_events
            .set(i64::try_from(pending_count).unwrap_or(i64::MAX));
        self.outbox_oldest_age_seconds
            .set(oldest_age_seconds.max(0));
    }

    pub fn set_process_resident_memory_bytes(&self, resident_bytes: u64) {
        self.process_resident_memory_bytes
            .set(i64::try_from(resident_bytes).unwrap_or(i64::MAX));
    }

    pub fn set_process_memory_profile(&self, profile: &ProcessMemoryProfile) {
        self.set_process_resident_memory_bytes(profile.resident_bytes);
        self.process_resident_memory_high_water_mark_bytes
            .set(i64::try_from(profile.resident_high_water_mark_bytes).unwrap_or(i64::MAX));
        self.process_virtual_memory_bytes
            .set(i64::try_from(profile.virtual_memory_bytes).unwrap_or(i64::MAX));
        self.process_heap_memory_bytes
            .set(i64::try_from(profile.heap_bytes).unwrap_or(i64::MAX));
        self.process_swap_memory_bytes
            .set(i64::try_from(profile.swap_bytes).unwrap_or(i64::MAX));
    }

    pub fn observe_process_memory_profile_collection_failure(&self) {
        self.process_memory_profile_collection_failures.inc();
    }

    pub fn set_rate_limiter_bucket_count(&self, buckets: usize) {
        self.rate_limiter_buckets
            .set(i64::try_from(buckets).unwrap_or(i64::MAX));
    }

    pub fn observe_request_route_fallback(&self) {
        self.request_route_fallback_total.inc();
    }

    pub fn observe_storage_budget(&self, total_bytes: u64, level_label: &str, severity_code: i64) {
        self.storage_budget_bytes
            .set(i64::try_from(total_bytes).unwrap_or(i64::MAX));
        self.storage_budget_level.set(severity_code.max(0));
        self.storage_budget_threshold_hits
            .get_or_create(&ThresholdLabels {
                level: level_label.to_owned(),
            })
            .inc();
    }

    pub fn sync_grading_projection_metrics(&self, snapshot: &GradingProjectionSnapshot) {
        self.grading_projection_lag_seconds
            .set(snapshot.lag_seconds.max(0));
        self.grading_projection_cycle_duration_seconds
            .observe(snapshot.cycle_duration_seconds.max(0.0));

        let mut last_totals = self
            .projection_last_totals
            .lock()
            .expect("projection totals lock");
        increment_counter_by(
            &self.grading_projection_rows_processed_total,
            "schedule",
            snapshot.schedule_rows_processed_total,
            &mut last_totals.schedule,
        );
        increment_counter_by(
            &self.grading_projection_rows_processed_total,
            "submission",
            snapshot.submission_rows_processed_total,
            &mut last_totals.submission,
        );
        increment_counter_by(
            &self.grading_projection_rows_processed_total,
            "section",
            snapshot.section_rows_processed_total,
            &mut last_totals.section,
        );
        increment_counter_by(
            &self.grading_projection_rows_processed_total,
            "writing_task",
            snapshot.writing_task_rows_processed_total,
            &mut last_totals.writing_task,
        );
        drop(last_totals);

        let mut last_failures = self
            .projection_last_failures_total
            .lock()
            .expect("projection failures lock");
        if snapshot.failures_total >= *last_failures {
            for _ in 0..(snapshot.failures_total - *last_failures) {
                self.grading_projection_failures_total.inc();
            }
            *last_failures = snapshot.failures_total;
        } else {
            *last_failures = snapshot.failures_total;
        }
    }

    pub fn render(&self) -> Result<String, fmt::Error> {
        let registry = self.registry.lock().expect("telemetry registry lock");
        let mut output = String::new();
        encode(&mut output, &registry)?;
        Ok(output)
    }
}

fn increment_counter_by(
    family: &Family<ProjectionEntityLabels, Counter>,
    entity: &str,
    next_total: u64,
    last_total: &mut u64,
) {
    if next_total >= *last_total {
        let delta = next_total - *last_total;
        if delta > 0 {
            let counter = family.get_or_create(&ProjectionEntityLabels {
                entity: entity.to_owned(),
            });
            for _ in 0..delta {
                counter.inc();
            }
        }
    }
    *last_total = next_total;
}

#[cfg(test)]
mod tests {
    use super::{ProcessMemoryProfile, Telemetry};

    #[test]
    fn render_includes_process_memory_profile_metrics() {
        let telemetry = Telemetry::new();
        telemetry.set_process_memory_profile(&ProcessMemoryProfile {
            resident_bytes: 1024,
            resident_high_water_mark_bytes: 2048,
            virtual_memory_bytes: 4096,
            heap_bytes: 512,
            swap_bytes: 256,
        });

        let rendered = telemetry.render().expect("render metrics");
        assert!(rendered.contains("backend_process_resident_memory_bytes 1024"));
        assert!(rendered.contains("backend_process_resident_memory_high_water_mark_bytes 2048"));
        assert!(rendered.contains("backend_process_virtual_memory_bytes 4096"));
        assert!(rendered.contains("backend_process_heap_memory_bytes 512"));
        assert!(rendered.contains("backend_process_swap_memory_bytes 256"));
    }

    #[test]
    fn render_includes_memory_profile_failure_counter() {
        let telemetry = Telemetry::new();
        telemetry.observe_process_memory_profile_collection_failure();
        telemetry.observe_process_memory_profile_collection_failure();

        let rendered = telemetry.render().expect("render metrics");
        assert!(rendered.contains("backend_process_memory_profile_collection_failures_total"));
        let metric_value = metric_value(
            &rendered,
            "backend_process_memory_profile_collection_failures_total",
        )
        .expect("failure counter value");
        assert_eq!(metric_value, 2.0);
    }

    fn metric_value(rendered: &str, metric_name: &str) -> Option<f64> {
        rendered.lines().find_map(|line| {
            if line.starts_with('#') || !line.starts_with(metric_name) {
                return None;
            }
            let (_, value) = line.split_once(' ')?;
            value.trim().parse::<f64>().ok()
        })
    }
}
