use std::{
    collections::HashMap,
    fmt,
    sync::{
        atomic::{AtomicI64, Ordering},
        Arc, Mutex,
    },
};

use ielts_backend_domain::schedule::LiveUpdateEvent;
use ielts_backend_infrastructure::config::AppConfig;
// MySQL doesn't support LISTEN/NOTIFY like PostgreSQL, so PgListener is not available
// use sqlx::postgres::PgListener;
use tokio::sync::broadcast;

#[derive(Clone)]
pub struct LiveUpdateHub {
    sender: broadcast::Sender<LiveUpdateEvent>,
    schedule_senders: Arc<Mutex<HashMap<String, broadcast::Sender<LiveUpdateEvent>>>>,
    attempt_senders: Arc<Mutex<HashMap<String, broadcast::Sender<LiveUpdateEvent>>>>,
    topic_channel_capacity: usize,
    connection_count: Arc<AtomicI64>,
    connection_cap: i64,
    user_connections: Arc<Mutex<HashMap<String, usize>>>,
    connections_per_user_cap: usize,
    connections_per_schedule_cap: usize,
    schedule_connections: Arc<Mutex<HashMap<String, usize>>>,
}

impl fmt::Debug for LiveUpdateHub {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LiveUpdateHub")
            .finish_non_exhaustive()
    }
}

impl Default for LiveUpdateHub {
    fn default() -> Self {
        Self::new()
    }
}

impl LiveUpdateHub {
    pub fn new() -> Self {
        Self::with_config(&AppConfig::default())
    }

    pub fn with_config(config: &AppConfig) -> Self {
        let (sender, _) = broadcast::channel(256);
        Self {
            sender,
            schedule_senders: Arc::new(Mutex::new(HashMap::new())),
            attempt_senders: Arc::new(Mutex::new(HashMap::new())),
            topic_channel_capacity: 64,
            connection_count: Arc::new(AtomicI64::new(0)),
            connection_cap: i64::try_from(config.websocket_connection_cap).unwrap_or(i64::MAX),
            user_connections: Arc::new(Mutex::new(HashMap::new())),
            connections_per_user_cap: config.websocket_connections_per_user_cap,
            connections_per_schedule_cap: config.websocket_connections_per_schedule_cap,
            schedule_connections: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn subscribe(&self) -> broadcast::Receiver<LiveUpdateEvent> {
        self.subscribe_all()
    }

    pub fn subscribe_all(&self) -> broadcast::Receiver<LiveUpdateEvent> {
        self.sender.subscribe()
    }

    fn subscribe_topic(
        &self,
        topics: &Arc<Mutex<HashMap<String, broadcast::Sender<LiveUpdateEvent>>>>,
        topic_key: &str,
    ) -> broadcast::Receiver<LiveUpdateEvent> {
        let sender = {
            let mut guard = topics.lock().unwrap();
            guard.retain(|_, sender| sender.receiver_count() > 0);
            if let Some(existing) = guard.get(topic_key) {
                existing.clone()
            } else {
                let (topic_sender, _) = broadcast::channel(self.topic_channel_capacity);
                guard.insert(topic_key.to_owned(), topic_sender.clone());
                topic_sender
            }
        };
        sender.subscribe()
    }

    pub fn subscribe_schedule(&self, schedule_id: &str) -> broadcast::Receiver<LiveUpdateEvent> {
        self.subscribe_topic(&self.schedule_senders, schedule_id)
    }

    pub fn subscribe_attempt(&self, attempt_id: &str) -> broadcast::Receiver<LiveUpdateEvent> {
        self.subscribe_topic(&self.attempt_senders, attempt_id)
    }

    fn cleanup_topic(
        &self,
        topics: &Arc<Mutex<HashMap<String, broadcast::Sender<LiveUpdateEvent>>>>,
        topic_key: &str,
    ) {
        let mut guard = topics.lock().unwrap();
        if guard
            .get(topic_key)
            .is_some_and(|sender| sender.receiver_count() == 0)
        {
            guard.remove(topic_key);
        }
    }

    pub fn cleanup_schedule_topic_if_idle(&self, schedule_id: &str) {
        self.cleanup_topic(&self.schedule_senders, schedule_id);
    }

    pub fn cleanup_attempt_topic_if_idle(&self, attempt_id: &str) {
        self.cleanup_topic(&self.attempt_senders, attempt_id);
    }

    fn publish_to_topic(
        &self,
        topics: &Arc<Mutex<HashMap<String, broadcast::Sender<LiveUpdateEvent>>>>,
        topic_key: &str,
        event: LiveUpdateEvent,
    ) {
        let sender = { topics.lock().unwrap().get(topic_key).cloned() };
        if let Some(sender) = sender {
            let _ = sender.send(event);
            if sender.receiver_count() == 0 {
                self.cleanup_topic(topics, topic_key);
            }
        }
    }

    pub fn publish(&self, event: LiveUpdateEvent) {
        let _ = self.sender.send(event.clone());
        let topic_key = event.id.clone();

        if matches!(
            event.kind.as_str(),
            "schedule_runtime" | "schedule_roster" | "schedule_alert"
        ) {
            self.publish_to_topic(&self.schedule_senders, &topic_key, event.clone());
        }

        if event.kind == "attempt" {
            self.publish_to_topic(&self.attempt_senders, &topic_key, event);
        }
    }

    pub fn connection_opened(&self, user_id: &str) -> i64 {
        let mut users = self.user_connections.lock().unwrap();
        let count = users.entry(user_id.to_owned()).or_insert(0);
        *count += 1;
        drop(users);
        self.connection_count.fetch_add(1, Ordering::SeqCst) + 1
    }

    pub fn connection_closed(&self, user_id: &str) -> i64 {
        let mut users = self.user_connections.lock().unwrap();
        if let Some(count) = users.get_mut(user_id) {
            if *count > 0 {
                *count -= 1;
            }
            if *count == 0 {
                users.remove(user_id);
            }
        }
        drop(users);

        let next = self.connection_count.fetch_sub(1, Ordering::SeqCst) - 1;
        if next < 0 {
            self.connection_count.store(0, Ordering::SeqCst);
            0
        } else {
            next
        }
    }

    pub fn can_user_connect(&self, user_id: &str) -> bool {
        let users = self.user_connections.lock().unwrap();
        users.get(user_id).map(|c| *c).unwrap_or(0) < self.connections_per_user_cap
    }

    pub fn is_at_capacity(&self) -> bool {
        self.connection_count.load(Ordering::SeqCst) >= self.connection_cap
    }

    pub fn is_schedule_at_capacity(&self, schedule_id: &str) -> bool {
        let schedules = self.schedule_connections.lock().unwrap();
        schedules.get(schedule_id).copied().unwrap_or(0) >= self.connections_per_schedule_cap
    }

    pub fn subscribe_to_schedule(&self, schedule_id: &str, user_id: &str) {
        let _ = user_id;
        let mut schedules = self.schedule_connections.lock().unwrap();
        let count = schedules.entry(schedule_id.to_owned()).or_insert(0);
        *count = count.saturating_add(1);
    }

    pub fn unsubscribe_from_schedule(&self, schedule_id: &str, user_id: &str) {
        let _ = user_id;
        let mut schedules = self.schedule_connections.lock().unwrap();
        if let Some(count) = schedules.get_mut(schedule_id) {
            if *count > 0 {
                *count -= 1;
            }
            if *count == 0 {
                schedules.remove(schedule_id);
            }
        }
    }

    #[cfg(test)]
    fn topic_count(
        &self,
        topics: &Arc<Mutex<HashMap<String, broadcast::Sender<LiveUpdateEvent>>>>,
    ) -> usize {
        topics.lock().unwrap().len()
    }

    #[cfg(test)]
    fn schedule_topic_count(&self) -> usize {
        self.topic_count(&self.schedule_senders)
    }

    #[cfg(test)]
    fn attempt_topic_count(&self) -> usize {
        self.topic_count(&self.attempt_senders)
    }
}

pub fn spawn_postgres_listener(
    _config: AppConfig,
    _hub: LiveUpdateHub,
) -> Option<tokio::task::JoinHandle<()>> {
    // MySQL doesn't support LISTEN/NOTIFY like PostgreSQL
    // Live updates would need to be implemented using a different mechanism (e.g., Redis pub/sub)
    // For now, return None to disable this feature in MySQL mode
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn schedule_capacity_counts_connections_not_unique_users() {
        let mut config = AppConfig::default();
        config.websocket_connections_per_schedule_cap = 2;
        let hub = LiveUpdateHub::with_config(&config);

        assert!(!hub.is_schedule_at_capacity("schedule-1"));
        hub.subscribe_to_schedule("schedule-1", "user-1");
        assert!(!hub.is_schedule_at_capacity("schedule-1"));
        hub.subscribe_to_schedule("schedule-1", "user-1");
        assert!(hub.is_schedule_at_capacity("schedule-1"));

        hub.unsubscribe_from_schedule("schedule-1", "user-1");
        assert!(!hub.is_schedule_at_capacity("schedule-1"));
    }

    #[test]
    fn default_schedule_capacity_supports_six_hundred_connections() {
        let hub = LiveUpdateHub::new();

        assert!(!hub.is_schedule_at_capacity("schedule-1"));
        for index in 0..599 {
            hub.subscribe_to_schedule("schedule-1", &format!("user-{index}"));
        }
        assert!(!hub.is_schedule_at_capacity("schedule-1"));

        hub.subscribe_to_schedule("schedule-1", "user-599");
        assert!(hub.is_schedule_at_capacity("schedule-1"));
    }

    #[test]
    fn connection_caps_respect_config() {
        let mut config = AppConfig::default();
        config.websocket_connection_cap = 1;
        config.websocket_connections_per_user_cap = 1;
        let hub = LiveUpdateHub::with_config(&config);

        assert!(!hub.is_at_capacity());
        assert!(hub.can_user_connect("user-1"));
        hub.connection_opened("user-1");
        assert!(hub.is_at_capacity());
        assert!(!hub.can_user_connect("user-1"));
    }

    #[tokio::test]
    async fn publishes_schedule_events_only_to_matching_schedule_subscribers() {
        let hub = LiveUpdateHub::new();
        let mut schedule_rx = hub.subscribe_schedule("schedule-1");
        let mut other_schedule_rx = hub.subscribe_schedule("schedule-2");

        hub.publish(LiveUpdateEvent {
            kind: "schedule_runtime".to_owned(),
            id: "schedule-1".to_owned(),
            revision: 1,
            event: "runtime_tick".to_owned(),
        });

        let received = tokio::time::timeout(Duration::from_millis(200), schedule_rx.recv())
            .await
            .expect("schedule subscriber should receive event")
            .expect("schedule event should be readable");
        assert_eq!(received.id, "schedule-1");

        let missed =
            tokio::time::timeout(Duration::from_millis(100), other_schedule_rx.recv()).await;
        assert!(
            missed.is_err(),
            "other schedule subscriber must not receive event"
        );
    }

    #[tokio::test]
    async fn publishes_attempt_events_only_to_matching_attempt_subscribers() {
        let hub = LiveUpdateHub::new();
        let mut attempt_rx = hub.subscribe_attempt("attempt-1");
        let mut other_attempt_rx = hub.subscribe_attempt("attempt-2");

        hub.publish(LiveUpdateEvent {
            kind: "attempt".to_owned(),
            id: "attempt-1".to_owned(),
            revision: 9,
            event: "mutated".to_owned(),
        });

        let received = tokio::time::timeout(Duration::from_millis(200), attempt_rx.recv())
            .await
            .expect("attempt subscriber should receive event")
            .expect("attempt event should be readable");
        assert_eq!(received.id, "attempt-1");

        let missed =
            tokio::time::timeout(Duration::from_millis(100), other_attempt_rx.recv()).await;
        assert!(
            missed.is_err(),
            "other attempt subscriber must not receive event"
        );
    }

    #[test]
    fn cleans_up_idle_topic_senders() {
        let hub = LiveUpdateHub::new();

        let schedule_rx = hub.subscribe_schedule("schedule-1");
        let attempt_rx = hub.subscribe_attempt("attempt-1");
        assert_eq!(hub.schedule_topic_count(), 1);
        assert_eq!(hub.attempt_topic_count(), 1);

        drop(schedule_rx);
        drop(attempt_rx);

        hub.cleanup_schedule_topic_if_idle("schedule-1");
        hub.cleanup_attempt_topic_if_idle("attempt-1");
        assert_eq!(hub.schedule_topic_count(), 0);
        assert_eq!(hub.attempt_topic_count(), 0);
    }
}
